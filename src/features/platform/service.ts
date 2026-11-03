import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { rows, one, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { roles } from "@/lib/permissions";
import { log } from "@/features/orders/service";
const text = z.string().trim().min(2).max(150),
  id = z.string().min(1).max(150);
export const platformAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("onboard"),
    organization: text,
    restaurant: text,
  }),
  z.object({ action: z.literal("restaurant"), organization: id, name: text }),
  z.object({
    action: z.literal("invite"),
    restaurant: id,
    email: z.email().max(150),
    roles: z
      .array(z.enum(roles).exclude(["SUPER_ADMIN"]))
      .min(1)
      .max(8),
  }),
  z.object({
    action: z.literal("accept"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    action: z.literal("membership"),
    restaurant: id,
    profile: id,
    roles: z.array(z.enum(roles).exclude(["SUPER_ADMIN"])).max(8),
  }),
  z.object({
    action: z.literal("support"),
    restaurant: id,
    profile: id,
    reason: z.string().trim().min(10).max(500),
    minutes: z.number().int().min(5).max(60),
  }),
  z.object({ action: z.literal("revokeSupport"), restaurant: id, grant: id }),
  z.object({
    action: z.literal("loyaltyScope"),
    organization: id,
    scope: z.enum(["restaurant", "organization"]),
  }),
]);
export async function initializeRestaurant(db: DB, r: string) {
  await db.query(
    "INSERT INTO shop_settings(restaurant_id,config) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [
      r,
      JSON.stringify({
        open: false,
        prepMinutes: 20,
        interval: 15,
        capacity: 10,
        hours: [],
        categories: ["Entrées", "Plats", "Desserts", "Boissons"],
        address: "",
        phone: "",
        logo: "",
        googleBusinessUrl: "",
        googleReviewUrl: "",
      }),
    ],
  );
  await db.query(
    "INSERT INTO site_documents(restaurant_id) VALUES($1) ON CONFLICT DO NOTHING",
    [r],
  );
}
export async function overview(db: DB, user: Actor) {
  return {
    user,
    organizations: await rows(
      db,
      "SELECT o.*,m.role FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id WHERE m.profile_id=$1 ORDER BY o.name",
      [user.id],
    ),
    restaurants: await rows(
      db,
      "SELECT DISTINCT r.* FROM restaurants r LEFT JOIN memberships m ON m.restaurant_id=r.id LEFT JOIN organization_memberships om ON om.organization_id=r.organization_id WHERE m.profile_id=$1 OR (om.profile_id=$1 AND om.role IN ('OWNER','ADMIN')) ORDER BY r.name",
      [user.id],
    ),
  };
}
export async function assertAdmin(db: DB, user: Actor, r: string) {
  const u = await scope(db, user, r);
  if (!(u.roles || [u.role]).includes("OWNER"))
    throw new Error("Administration non autorisée.");
  return u;
}
export async function platformPerform(db: DB, user: Actor, raw: unknown) {
  const a = platformAction.parse(raw);
  if (a.action === "onboard") {
    const org = randomUUID(),
      r = randomUUID();
    await db.query("SELECT app.bootstrap_organization($1,$2,$3,$4)", [
      org,
      a.organization,
      r,
      a.restaurant,
    ]);
    return { organization: org, restaurant: r };
  }
  if (a.action === "accept") {
    await db.query("SELECT app.accept_invitation($1)", [
      createHash("sha256").update(a.token).digest("hex"),
    ]);
    return { accepted: true };
  }
  if (a.action === "restaurant") {
    await one(
      db,
      "SELECT organization_id FROM organization_memberships WHERE organization_id=$1 AND profile_id=$2 AND role IN ('OWNER','ADMIN')",
      [a.organization, user.id],
    );
    const r = randomUUID();
    await db.query(
      "INSERT INTO restaurants(id,name,organization_id) VALUES($1,$2,$3)",
      [r, a.name, a.organization],
    );
    await db.query("INSERT INTO memberships VALUES($1,$2,'OWNER')", [
      user.id,
      r,
    ]);
    return { restaurant: r };
  }
  if (a.action === "loyaltyScope") {
    await one(
      db,
      "SELECT organization_id FROM organization_memberships WHERE organization_id=$1 AND profile_id=$2 AND role IN ('OWNER','ADMIN')",
      [a.organization, user.id],
    );
    await db.query("SELECT app.set_loyalty_scope($1,$2)", [
      a.organization,
      a.scope,
    ]);
    return { scope: a.scope };
  }
  await assertAdmin(db, user, a.restaurant);
  if (a.action === "invite") {
    const token = randomBytes(32).toString("hex"),
      iid = randomUUID();
    const org = await one<{ organization_id: string }>(
      db,
      "SELECT organization_id FROM restaurants WHERE id=$1",
      [a.restaurant],
    );
    await db.query(
      "INSERT INTO invitations(id,organization_id,restaurant_id,email,roles,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days',$7)",
      [
        iid,
        org.organization_id,
        a.restaurant,
        a.email.toLowerCase(),
        JSON.stringify([...new Set(a.roles)]),
        createHash("sha256").update(token).digest("hex"),
        user.id,
      ],
    );
    await log(db, a.restaurant, user.id, "Invitation créée", iid);
    return { token };
  }
  if (a.action === "membership") {
    if (a.profile === user.id)
      throw new Error(
        "Utilisez un autre administrateur pour modifier vos propres accès.",
      );
    const owners = await rows<{ profile_id: string }>(
      db,
      "SELECT profile_id FROM memberships WHERE restaurant_id=$1 AND role='OWNER' FOR UPDATE",
      [a.restaurant],
    );
    if (
      owners.some((p) => p.profile_id === a.profile) &&
      owners.length === 1 &&
      !a.roles.includes("OWNER")
    )
      throw new Error("Dernier propriétaire protégé.");
    await db.query(
      "DELETE FROM memberships WHERE profile_id=$1 AND restaurant_id=$2",
      [a.profile, a.restaurant],
    );
    for (const role of new Set(a.roles))
      await db.query("INSERT INTO memberships VALUES($1,$2,$3)", [
        a.profile,
        a.restaurant,
        role,
      ]);
    await log(db, a.restaurant, user.id, "Affectations modifiées", a.profile);
    return { updated: true };
  }
  if (a.action === "support") {
    const target = await one<{ allowed: boolean }>(
      db,
      "SELECT app.is_platform_admin($1) AS allowed",
      [a.profile],
    );
    if (!target.allowed) throw new Error("Support non autorisé.");
    const gid = randomUUID();
    await db.query(
      "INSERT INTO support_grants(id,profile_id,restaurant_id,reason,expires_at,approved_by) VALUES($1,$2,$3,$4,now()+make_interval(mins=>$5),$6)",
      [gid, a.profile, a.restaurant, a.reason, a.minutes, user.id],
    );
    await log(
      db,
      a.restaurant,
      user.id,
      "Accès support temporaire autorisé",
      gid,
    );
    return { id: gid };
  }
  await db.query(
    "UPDATE support_grants SET revoked_at=now() WHERE id=$1 AND restaurant_id=$2",
    [a.grant, a.restaurant],
  );
  await log(db, a.restaurant, user.id, "Accès support révoqué", a.grant);
  return { revoked: true };
}
