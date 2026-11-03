import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { one, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { customerForActor } from "./account";
import { log } from "@/features/orders/service";
export async function claimReward(
  db: DB,
  r: string,
  user: Actor,
  raw: unknown,
) {
  const a = z.object({ reward: z.string(), key: z.uuid() }).parse(raw),
    customer = await customerForActor(db, r, user);
  const prior = await db.query<{ code: string }>(
    "SELECT code FROM promo_codes WHERE id=$1 AND customer_id=$2 AND restaurant_id=$3",
    [a.key, customer, r],
  );
  if (prior.rows.length) return prior.rows[0];
  const reward = await one<{
    id: string;
    name: string;
    points_cost: number;
    kind: string;
    value: number;
    menu_id: string | null;
  }>(
    db,
    "SELECT * FROM loyalty_rewards WHERE id=$1 AND restaurant_id=$2 AND active FOR UPDATE",
    [a.reward, r],
  );
  if (reward.kind !== "fixed" || reward.value <= 0)
    throw new Error(
      "Cette récompense nécessite un traitement par le restaurant.",
    );
  const c = await one<{ points: number; consent: boolean }>(
    db,
    "SELECT coalesce(app.customer_points(id),points) AS points,consent FROM customers WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [customer, r],
  );
  // Recheck after locking: a concurrent request may have completed this same key.
  const replay = await db.query<{ code: string }>(
    "SELECT code FROM promo_codes WHERE id=$1 AND customer_id=$2 AND restaurant_id=$3",
    [a.key, customer, r],
  );
  if (replay.rows.length) return replay.rows[0];
  if (!c.consent || c.points < reward.points_cost)
    throw new Error("Consentement absent ou points insuffisants.");
  const code = "CADEAU-" + randomBytes(6).toString("hex").toUpperCase();
  await db.query("UPDATE customers SET points=points-$2 WHERE id=$1", [
    customer,
    reward.points_cost,
  ]);
  await db.query(
    "INSERT INTO loyalty_transactions(id,customer_id,points,reason) VALUES($1,$2,$3,$4)",
    [
      randomUUID(),
      customer,
      -reward.points_cost,
      `Récompense : ${reward.name}`,
    ],
  );
  await db.query(
    "INSERT INTO promo_codes(id,restaurant_id,customer_id,code,kind,value,points_cost,expires_on,token,created_by) VALUES($1,$2,$3,$4,'fixed',$5,$6,CURRENT_DATE+30,$7,$8)",
    [
      a.key,
      r,
      customer,
      code,
      reward.value,
      reward.points_cost,
      randomBytes(32).toString("hex"),
      user.id,
    ],
  );
  await log(db, r, user.id, "Récompense échangée contre des points", a.key);
  return { code };
}
