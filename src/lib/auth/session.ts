import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, one, rows, type DB } from "../database/db";
import type { Role } from "../permissions";
export type Actor = { id: string; name: string; role: Role };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function login(id: string) {
  const db = await getDb();
  const profile = await one<Actor>(db, "SELECT * FROM profiles WHERE id=$1", [
    id,
  ]);
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",
    [hash(token), profile.id],
  );
  (await cookies()).set("dattier_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: !!process.env.VERCEL,
    path: "/",
    maxAge: 43200,
  });
  return profile;
}
export async function actor() {
  const token = (await cookies()).get("dattier_session")?.value;
  if (!token) throw new Error("Connexion requise.");
  return one<Actor>(
    await getDb(),
    "SELECT p.* FROM profiles p JOIN sessions s ON s.profile_id=p.id WHERE s.token=$1 AND s.expires_at>now()",
    [hash(token)],
  );
}
export async function scope(db: DB, user: Actor, r: string) {
  const memberships = await rows<{ role: Role }>(
    db,
    "SELECT role FROM memberships WHERE profile_id=$1 AND restaurant_id=$2",
    [user.id, r],
  );
  if (!memberships.length) throw new Error("Établissement non autorisé.");
  return { ...user, role: memberships[0].role };
}
