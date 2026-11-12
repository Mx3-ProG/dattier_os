import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { one, type DB } from "@/infrastructure/database/db";
import type { Actor } from "@/infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { log } from "@/features/orders/service";
export const promoSchema = z.object({
  action: z.literal("issuePromo"),
  customer: z.string().min(1).optional(),
  consentConfirmed: z.coerce.boolean().default(false),
  public: z.coerce.boolean().default(false),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,40}$/, "4 à 40 lettres, chiffres ou tirets."),
  kind: z.enum(["percent", "fixed"]),
  value: z.coerce.number().int().positive().max(100000),
  points: z.coerce.number().int().min(0).max(100000),
  effect: z.enum(["discount", "points"]).default("discount"),
  pointsAward: z.coerce.number().int().min(0).max(100000).default(0),
  requiredMenu: z.string().min(1).optional(),
  usageLimit: z.coerce.number().int().positive().max(100000).default(1),
  expires: z.string().date(),
});
export const rewardSchema = z.object({
  action: z.literal("loyaltyReward"),
  name: z.string().trim().min(1).max(150),
  points: z.coerce.number().int().positive().max(100000),
  kind: z.enum(["fixed", "product", "custom"]),
  value: z.coerce.number().int().min(0).max(100000),
  menu: z.string().min(1).optional(),
});
export async function issuePromo(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof promoSchema>,
) {
  requirePermission(user.roles ?? user.role, "customers");
  if (!a.public && !a.customer)
    throw new Error("Choisissez un client ou rendez le code public.");
  if (a.effect === "discount" && a.kind === "percent" && a.value > 100)
    throw new Error("La remise ne peut pas dépasser 100 %.");
  if (a.effect === "points" && !a.pointsAward)
    throw new Error("Indiquez le nombre de points accordés.");
  if (a.customer) {
    const c = await one<{ points: number; consent: boolean }>(
      db,
      "SELECT points,consent FROM customers WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
      [a.customer, r],
    );
    if (!c.consent && !a.consentConfirmed)
      throw new Error("Le consentement fidélité est nécessaire.");
    if (!c.consent && a.consentConfirmed)
      await db.query("UPDATE customers SET consent=true WHERE id=$1", [
        a.customer,
      ]);
    if (c.points < a.points) throw new Error("Solde de points insuffisant.");
  }
  if (a.requiredMenu)
    await one(
      db,
      "SELECT id FROM menu_items WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL",
      [a.requiredMenu, r],
    );
  const valid = await one<{ ok: boolean }>(
    db,
    "SELECT $1::date>=CURRENT_DATE AS ok",
    [a.expires],
  );
  if (!valid.ok) throw new Error("Choisissez une date de validité future.");
  const id = randomUUID();
  await db.query(
    "INSERT INTO promo_codes(id,restaurant_id,customer_id,code,kind,value,points_cost,expires_on,token,created_by,effect,points_award,required_menu_id,usage_limit,public) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    [
      id,
      r,
      a.customer ?? null,
      a.code,
      a.kind,
      a.value,
      a.points,
      a.expires,
      randomBytes(32).toString("hex"),
      user.id,
      a.effect,
      a.effect === "points" ? a.pointsAward : 0,
      a.requiredMenu ?? null,
      a.usageLimit,
      a.public,
    ],
  );
  if (a.customer && a.points) {
    await db.query("UPDATE customers SET points=points-$2 WHERE id=$1", [
      a.customer,
      a.points,
    ]);
    await db.query(
      "INSERT INTO loyalty_transactions VALUES($1,$2,$3,$4,$5,now())",
      [
        randomUUID(),
        a.customer,
        -a.points,
        "Conversion en code promo",
        user.id,
      ],
    );
  }
  await log(db, r, user.id, "Code promotionnel créé", id);
  return id;
}
export async function cancelPromo(db: DB, r: string, user: Actor, id: string) {
  requirePermission(user.roles ?? user.role, "customers");
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
  if (p.customer_id && p.points_cost) {
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
  }
  await log(db, r, user.id, "Code promo annulé · points restitués", id);
}

export async function redeemCheckoutPromo(
  db: DB,
  r: string,
  code: string,
  customer: string,
  subtotal: number,
  menuIds: string[],
  consent: boolean,
) {
  const p = await one<{
    id: string;
    customer_id: string | null;
    kind: string;
    value: number;
    effect: string;
    points_award: number;
    required_menu_id: string | null;
    usage_limit: number;
    usage_count: number;
    status: string;
    expired: boolean;
  }>(
    db,
    "SELECT *,expires_on<CURRENT_DATE AS expired FROM promo_codes WHERE restaurant_id=$1 AND code=$2 FOR UPDATE",
    [r, code.trim().toUpperCase()],
  );
  if (p.status !== "active" || p.expired || p.usage_count >= p.usage_limit)
    throw new Error("Code expiré, annulé ou entièrement utilisé.");
  if (p.customer_id && p.customer_id !== customer)
    throw new Error("Ce code est réservé à un autre client.");
  if (p.required_menu_id && !menuIds.includes(p.required_menu_id))
    throw new Error("Ce code nécessite le produit associé dans le panier.");
  if (p.effect === "points" && !consent)
    throw new Error(
      "Acceptez le programme de fidélité pour recevoir les points.",
    );
  if (
    (
      await one<{ count: number }>(
        db,
        "SELECT count(*)::int AS count FROM promo_redemptions WHERE promo_id=$1 AND customer_id=$2",
        [p.id, customer],
      )
    ).count
  )
    throw new Error("Ce code a déjà été utilisé avec cet e-mail.");
  return {
    id: p.id,
    discount:
      p.effect === "discount"
        ? Math.min(
            subtotal,
            p.kind === "percent"
              ? Math.floor((subtotal * p.value) / 100)
              : p.value,
          )
        : 0,
    points: p.effect === "points" ? p.points_award : 0,
  };
}

export async function recordCheckoutPromo(
  db: DB,
  promo: { id: string; discount: number; points: number },
  order: string,
  customer: string,
) {
  await db.query(
    "INSERT INTO promo_redemptions(id,promo_id,order_id,customer_id,discount,points_awarded) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), promo.id, order, customer, promo.discount, promo.points],
  );
  await db.query(
    "UPDATE promo_codes SET usage_count=usage_count+1,status=CASE WHEN usage_count+1>=usage_limit THEN 'redeemed' ELSE status END,redeemed_at=CASE WHEN usage_count+1>=usage_limit THEN now() ELSE redeemed_at END WHERE id=$1",
    [promo.id],
  );
  if (promo.points) {
    await db.query("UPDATE customers SET points=points+$2 WHERE id=$1", [
      customer,
      promo.points,
    ]);
    await db.query(
      "INSERT INTO loyalty_transactions VALUES($1,$2,$3,$4,NULL,now())",
      [randomUUID(), customer, promo.points, "Code fidélité utilisé"],
    );
  }
}

export async function createReward(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof rewardSchema>,
) {
  requirePermission(user.roles ?? user.role, "customers");
  if (a.kind === "fixed" && !a.value)
    throw new Error("Indiquez la valeur de la remise.");
  if (a.kind === "product" && !a.menu)
    throw new Error("Choisissez le produit offert.");
  if (a.menu)
    await one(
      db,
      "SELECT id FROM menu_items WHERE id=$1 AND restaurant_id=$2",
      [a.menu, r],
    );
  const id = randomUUID();
  await db.query(
    "INSERT INTO loyalty_rewards(id,restaurant_id,name,points_cost,kind,value,menu_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, r, a.name, a.points, a.kind, a.value, a.menu ?? null],
  );
  await log(db, r, user.id, "Récompense fidélité créée", id);
  return id;
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
