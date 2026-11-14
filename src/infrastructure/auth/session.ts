import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, demoEnabled, publicDemoEnabled, one, rows, type DB } from "../database/db";
import type { Role } from "@/core/permissions";
import { appOrigin, oidcActor } from "./oidc";
import { isSuperAdminEmail } from "./superadmin";
export type Actor = {
  id: string;
  name: string;
  role: Role;
  roles?: Role[];
  email?: string;
  authIssuedAt?: number;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

async function requirePlan(db: DB, restaurant: string, minimum: number) {
  const mod = await import("@/features/platform/entitlements");
  return mod.requirePlan(db, restaurant, minimum as 39);
}

async function bindActor(userId: string, tokenHash: string) {
  const mod = await import("@/features/ops-security/context");
  return mod.bindActor(userId, tokenHash);
}

/* Démo publique : plusieurs instances, chacune avec sa base en mémoire.
   La session tient donc dans un cookie signé plutôt que dans la table sessions. */
const DEMO_TTL_MS = 12 * 3600 * 1000;
function demoSign(payload: string) {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 32)
    throw new Error("SESSION_SECRET (32 caractères minimum) est requis pour la démo publique.");
  return createHmac("sha256", key).update(`demo:${payload}`).digest("base64url");
}
function demoToken(profileId: string, issuedAt: number) {
  const payload = `${Buffer.from(profileId).toString("base64url")}.${issuedAt}`;
  return `pd.${payload}.${demoSign(payload)}`;
}
function readDemoToken(token: string) {
  const [prefix, id, issued, sig] = token.split(".");
  if (prefix !== "pd" || !id || !issued || !sig) return null;
  const expected = Buffer.from(demoSign(`${id}.${issued}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const issuedAt = Number(issued);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > DEMO_TTL_MS) return null;
  return { profileId: Buffer.from(id, "base64url").toString(), issuedAt };
}
export async function login(id: string) {
  if (!demoEnabled()) throw new Error("Connexion de démonstration désactivée.");
  const db = await getDb();
  const profile = await one<Actor>(db, "SELECT * FROM profiles WHERE id=$1", [
    id,
  ]);
  let token = randomBytes(32).toString("hex");
  if (publicDemoEnabled()) token = demoToken(profile.id, Date.now());
  else
    await db.query(
      "INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",
      [hash(token), profile.id],
    );
  (await cookies()).set("atacuisine_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: appOrigin().startsWith("https:"),
    path: "/",
    maxAge: 43200,
  });
  return profile;
}
export async function actor(): Promise<Actor> {
  if (!demoEnabled()) {
    const user = await oidcActor();
    await bindActor(user.id, hash(`${user.id}:${user.authIssuedAt}`));
    const isSuper =
      user.role === "SUPER_ADMIN" ||
      isSuperAdminEmail(user.email) ||
      user.roles?.includes("SUPER_ADMIN");
    return {
      ...user,
      role: isSuper ? "SUPER_ADMIN" : user.role,
      roles: isSuper ? ["SUPER_ADMIN", "OWNER"] : (user.roles ?? [user.role]),
    };
  }
  const token = (await cookies()).get("atacuisine_session")?.value;
  if (!token) throw new Error("Connexion requise.");
  if (publicDemoEnabled()) {
    const session = readDemoToken(token);
    if (!session) throw new Error("Connexion requise.");
    const user = await one<Actor>(await getDb(), "SELECT * FROM profiles WHERE id=$1", [session.profileId]);
    await bindActor(user.id, hash(token));
    const isSuper =
      user.role === "SUPER_ADMIN" ||
      isSuperAdminEmail(user.email) ||
      user.roles?.includes("SUPER_ADMIN");
    return {
      ...user,
      role: isSuper ? "SUPER_ADMIN" : user.role,
      roles: isSuper ? ["SUPER_ADMIN", "OWNER"] : (user.roles ?? [user.role]),
      authIssuedAt: session.issuedAt,
    };
  }
  const user = await one<Actor & { auth_issued_at: number }>(
    await getDb(),
    "SELECT p.*,(extract(epoch FROM (s.expires_at-interval '12 hours'))*1000)::float AS auth_issued_at FROM profiles p JOIN sessions s ON s.profile_id=p.id WHERE s.token=$1 AND s.expires_at>now()",
    [hash(token)],
  );
  await bindActor(user.id, hash(token));
  const isSuper =
    user.role === "SUPER_ADMIN" ||
    isSuperAdminEmail(user.email) ||
    user.roles?.includes("SUPER_ADMIN");
  return {
    ...user,
    role: isSuper ? "SUPER_ADMIN" : user.role,
    roles: isSuper ? ["SUPER_ADMIN", "OWNER"] : (user.roles ?? [user.role]),
    authIssuedAt: user.auth_issued_at,
  };
}
export async function scope(db: DB, user: Actor, r: string) {
  const isSuper =
    user.role === "SUPER_ADMIN" ||
    isSuperAdminEmail(user.email) ||
    user.roles?.includes("SUPER_ADMIN");
  if (isSuper) {
    return {
      ...user,
      role: "SUPER_ADMIN" as Role,
      roles: ["SUPER_ADMIN", "OWNER"] as Role[],
    };
  }
  await requirePlan(db, r, 39);
  const revoked = await rows<{ not_before: string }>(
    db,
    "SELECT not_before FROM restaurant_session_revocations WHERE restaurant_id=$1 AND profile_id=$2",
    [r, user.id],
  );
  if (
    revoked[0] &&
    (user.authIssuedAt || 0) <= Date.parse(revoked[0].not_before)
  )
    throw new Error("Connexion à renouveler pour cet établissement.");
  const memberships = await rows<{ role: Role }>(
    db,
    "SELECT m.role FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.profile_id=$1 AND m.restaurant_id=$2 AND p.status='active' ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END,m.role",
    [user.id, r],
  );
  if (!memberships.length) {
    const admin = await rows(
      db,
      "SELECT r.id FROM restaurants r JOIN organization_memberships m ON m.organization_id=r.organization_id JOIN profiles p ON p.id=m.profile_id WHERE r.id=$1 AND m.profile_id=$2 AND m.role IN ('OWNER','ADMIN') AND p.status='active'",
      [r, user.id],
    );
    if (admin.length)
      return { ...user, role: "OWNER" as Role, roles: ["OWNER"] as Role[] };
    const support = await rows(
      db,
      "SELECT g.id FROM support_grants g WHERE g.profile_id=$1 AND g.restaurant_id=$2 AND g.expires_at>now() AND g.revoked_at IS NULL AND app.is_platform_admin($1)",
      [user.id, r],
    );
    if (support.length)
      return { ...user, role: "OWNER" as Role, roles: ["OWNER"] as Role[] };
    throw new Error("Établissement non autorisé.");
  }
  return {
    ...user,
    role: memberships[0].role,
    roles: memberships.map((m) => m.role),
  };
}
