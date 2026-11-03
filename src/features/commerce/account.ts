import { randomUUID } from "node:crypto";
import { one, rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
export async function customerForActor(db: DB, r: string, user: Actor) {
  await one(db, "SELECT id FROM profiles WHERE id=$1 AND status='active'", [
    user.id,
  ]);
  if (!user.email) throw new Error("Connexion client vérifiée requise.");
  const restaurant = await one<{ organization_id: string }>(
    db,
    "SELECT organization_id FROM restaurants WHERE id=$1",
    [r],
  );
  const account = await one<{ id: string }>(
    db,
    "INSERT INTO organization_customers(id,organization_id,subject,email,name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,subject) DO UPDATE SET email=excluded.email,name=excluded.name RETURNING id",
    [randomUUID(), restaurant.organization_id, user.id, user.email, user.name],
  );
  const existing = await rows<{ id: string }>(
    db,
    "SELECT id FROM customers WHERE account_id=$1 AND restaurant_id=$2",
    [account.id, r],
  );
  if (existing.length) return existing[0].id;
  const id = randomUUID();
  const created = await one<{ id: string }>(
    db,
    "INSERT INTO customers(id,restaurant_id,name,contact,consent,points,account_id) VALUES($1,$2,$3,$4,false,0,$5) ON CONFLICT(restaurant_id,account_id) WHERE account_id IS NOT NULL DO UPDATE SET account_id=excluded.account_id RETURNING id",
    [id, r, user.name, user.email, account.id],
  );
  return created.id;
}
