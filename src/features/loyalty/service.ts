import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { one, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log } from "@/features/orders/service";
export const promoSchema = z.object({
  action: z.literal("issuePromo"),
  customer: z.string().min(1),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,40}$/, "4 à 40 lettres, chiffres ou tirets."),
  kind: z.enum(["percent", "fixed"]),
  value: z.coerce.number().int().positive().max(100000),
  points: z.coerce.number().int().min(0).max(100000),
  expires: z.string().date(),
});
export async function issuePromo(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof promoSchema>,
) {
  requirePermission(user, "customers");
  const c = await one<{ points: number; consent: boolean }>(
    db,
    "SELECT points,consent FROM customers WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [a.customer, r],
  );
  if (!c.consent) throw new Error("Le consentement fidélité est nécessaire.");
  if (c.points < a.points) throw new Error("Solde de points insuffisant.");
  if (a.kind === "percent" && a.value > 100)
    throw new Error("La remise ne peut pas dépasser 100 %.");
  const valid = await one<{ ok: boolean }>(
    db,
    "SELECT $1::date>=CURRENT_DATE AS ok",
    [a.expires],
  );
  if (!valid.ok) throw new Error("Choisissez une date de validité future.");
  const id = randomUUID();
  await db.query(
    "INSERT INTO promo_codes(id,restaurant_id,customer_id,code,kind,value,points_cost,expires_on,token,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      id,
      r,
      a.customer,
      a.code,
      a.kind,
      a.value,
      a.points,
      a.expires,
      randomBytes(32).toString("hex"),
      user.id,
    ],
  );
  await db.query("UPDATE customers SET points=points-$2 WHERE id=$1", [
    a.customer,
    a.points,
  ]);
  await db.query(
    "INSERT INTO loyalty_transactions VALUES($1,$2,$3,$4,$5,now())",
    [randomUUID(), a.customer, -a.points, "Conversion en code promo", user.id],
  );
  await log(db, r, user.id, "Code promo attribué au client", id);
}
export async function cancelPromo(db: DB, r: string, user: Actor, id: string) {
  requirePermission(user, "customers");
  const p = await one<{
    customer_id: string;
    status: string;
    points_cost: number;
  }>(
    db,
    "SELECT * FROM promo_codes WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [id, r],
  );
  if (p.status === "cancelled") return;
  if (p.status !== "active")
    throw new Error("Un code utilisé ne peut plus être annulé.");
  await db.query("UPDATE promo_codes SET status='cancelled' WHERE id=$1", [id]);
  await db.query("UPDATE customers SET points=points+$2 WHERE id=$1", [
    p.customer_id,
    p.points_cost,
  ]);
  await db.query(
    "INSERT INTO loyalty_transactions VALUES($1,$2,$3,$4,$5,now())",
    [
      randomUUID(),
      p.customer_id,
      p.points_cost,
      "Restitution après annulation du code promo",
      user.id,
    ],
  );
  await log(db, r, user.id, "Code promo annulé · points restitués", id);
}
export async function redeemPromo(
  db: DB,
  r: string,
  customer: string,
  code: string,
  subtotal: number,
) {
  if (subtotal <= 0) throw new Error("Aucun produit à régler.");
  await one(db, "SELECT id FROM customers WHERE id=$1 AND restaurant_id=$2", [
    customer,
    r,
  ]);
  const p = await one<{
    id: string;
    kind: string;
    value: number;
    status: string;
    expired: boolean;
  }>(
    db,
    "SELECT *,expires_on<CURRENT_DATE AS expired FROM promo_codes WHERE restaurant_id=$1 AND customer_id=$2 AND code=$3 FOR UPDATE",
    [r, customer, code.trim().toUpperCase()],
  );
  if (p.status !== "active" || p.expired)
    throw new Error("Code expiré, annulé ou déjà utilisé.");
  const discount = Math.min(
    subtotal,
    p.kind === "percent" ? Math.floor((subtotal * p.value) / 100) : p.value,
  );
  await db.query(
    "UPDATE promo_codes SET status='redeemed',redeemed_at=now() WHERE id=$1",
    [p.id],
  );
  return { id: p.id, discount };
}
