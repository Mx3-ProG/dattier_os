import { randomUUID } from "node:crypto";
import { rows, type DB } from "@/infrastructure/database/db";
import {
  creditPoints,
  ensureReferralCode,
  refreshBadges,
  settleReferral,
} from "./engagement";

/**
 * Fills the fictive customer's account so every gamified section has
 * something to show (demo mode only). Runs once per customer.
 */
export async function seedDemoEngagement(db: DB, r: string, customerId: string) {
  const seeded = await rows(
    db,
    "SELECT 1 FROM loyalty_transactions WHERE customer_id=$1 AND reference='demo:seed'",
    [customerId],
  );
  if (seeded.length) return;
  await db.query("UPDATE customers SET consent=true WHERE id=$1", [customerId]);
  await creditPoints(db, customerId, 180, "Bonus de bienvenue (démonstration)", "demo:seed");

  const rewards = await rows(
    db,
    "SELECT 1 FROM loyalty_rewards WHERE restaurant_id=$1 AND active",
    [r],
  );
  if (!rewards.length)
    for (const [name, cost, value] of [
      ["Boisson offerte", 100, 350],
      ["Dessert offert", 250, 600],
      ["Menu offert", 600, 1500],
    ] as const)
      await db.query(
        "INSERT INTO loyalty_rewards(id,restaurant_id,name,points_cost,kind,value) VALUES($1,$2,$3,$4,'fixed',$5)",
        [randomUUID(), r, name, cost, value],
      );

  const flash = await rows(
    db,
    "SELECT 1 FROM flash_promotions WHERE restaurant_id=$1 AND active AND ends_at>now()",
    [r],
  );
  if (!flash.length) {
    const dishes = await rows<{ id: string }>(
      db,
      "SELECT id FROM menu_items WHERE restaurant_id=$1 AND enabled AND archived_at IS NULL AND price>0 ORDER BY category,name LIMIT 2",
      [r],
    );
    for (const [n, dish] of dishes.entries())
      await db.query(
        "INSERT INTO flash_promotions(id,restaurant_id,menu_id,kind,value,starts_at,ends_at,member_bonus_points) VALUES($1,$2,$3,'percent',$4,now(),now()+($5||' hours')::interval,$6)",
        [randomUUID(), r, dish.id, n ? 20 : 30, n ? 30 : 5, n ? 10 : 15],
      );
  }

  // Two fictive friends: one has already ordered, the other just signed up.
  await ensureReferralCode(db, r, customerId);
  for (const [name, ordered] of [
    ["Lucas — fictif", true],
    ["Emma — fictif", false],
  ] as const) {
    const friend = randomUUID();
    await db.query(
      "INSERT INTO customers(id,restaurant_id,name,contact,consent,points) VALUES($1,$2,$3,$4,true,0)",
      [friend, r, name, `${friend.slice(0, 8)}@example.test`],
    );
    await db.query(
      "INSERT INTO customer_referrals(referred_customer_id,referrer_customer_id,restaurant_id) VALUES($1,$2,$3)",
      [friend, customerId, r],
    );
    if (ordered) await settleReferral(db, r, friend);
  }

  await db.query(
    `INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at,status,note,customer_id)
     VALUES($1,$2,'Camille — fictif','camille@example.test',2,
       ((CURRENT_DATE+3)::timestamp+time '20:00') AT TIME ZONE 'Europe/Paris',
       ((CURRENT_DATE+3)::timestamp+time '22:00') AT TIME ZONE 'Europe/Paris',
       'confirmed','Réservation fictive',$3)`,
    [randomUUID(), r, customerId],
  );
  await refreshBadges(db, customerId);
}
