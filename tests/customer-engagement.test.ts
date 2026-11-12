import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { one, rows } from "../src/infrastructure/database/db";
import { commerce } from "../src/features/commerce/service";
import { customerForActor } from "../src/features/commerce/account";
import { claimReward } from "../src/features/commerce/rewards";
import {
  attachCustomerReferral,
  awardBookingPoints,
  awardOrderPoints,
  createFlashPromotion,
  ensureReferralCode,
  saveEngagementSettings,
  settleReferral,
  stopFlashPromotion,
} from "../src/features/commerce/engagement";
import {
  applyFlash,
  bestFlash,
  earnedBadges,
  flashPrice,
  levelFor,
  monthStreak,
  nextMilestone,
  orderPoints,
  reachedMilestones,
  type FlashRule,
} from "../src/features/commerce/engagement-rules";
import type { Actor } from "../src/infrastructure/auth/session";

const owner: Actor = { id: "nadia", name: "Nadia", role: "OWNER" };
const R = "bernay";
let db: PGlite;

const rule = (over: Partial<FlashRule> = {}): FlashRule => ({
  id: "f1",
  menu_id: "m1",
  kind: "percent",
  value: 30,
  starts_at: new Date(Date.now() - 60000).toISOString(),
  ends_at: new Date(Date.now() + 3600000).toISOString(),
  member_bonus_points: 5,
  active: true,
  ...over,
});

test("règles : points, prix flash, niveaux, paliers, série et badges", () => {
  assert.equal(orderPoints(2599, 1), 25);
  assert.equal(orderPoints(2599, 1.5), 38);
  assert.equal(orderPoints(0, 1), 0);
  assert.equal(flashPrice(1000, { kind: "percent", value: 30 }), 700);
  assert.equal(flashPrice(1000, { kind: "price", value: 1500 }), 1000);
  assert.equal(bestFlash([rule()], "m1", 1000)?.price, 700);
  assert.equal(bestFlash([rule({ active: false })], "m1", 1000), null);
  assert.equal(
    bestFlash([rule({ ends_at: new Date(Date.now() - 1).toISOString() })], "m1", 1000),
    null,
  );
  const [flashed, plain] = applyFlash(
    [
      { id: "m1", price: 1000 },
      { id: "m2", price: 500 },
    ],
    [rule()],
  );
  assert.equal(flashed.price, 700);
  assert.equal(flashed.flash?.regular_price, 1000);
  assert.equal(flashed.flash?.percent, 30);
  assert.equal(plain.flash, undefined);
  assert.equal(levelFor(0).name, "Découverte");
  assert.equal(levelFor(160).name, "Gourmand");
  assert.equal(levelFor(160).next?.missing, 340);
  assert.equal(levelFor(5000).next, null);
  const milestones = [
    { count: 5, points: 300, label: "B" },
    { count: 3, points: 150, label: "A" },
  ];
  assert.equal(nextMilestone(milestones, 0)?.count, 3);
  assert.equal(nextMilestone(milestones, 3)?.count, 5);
  assert.equal(nextMilestone(milestones, 9), null);
  assert.deepEqual(
    reachedMilestones(milestones, 4).map((m) => m.count),
    [3],
  );
  const now = new Date("2026-11-15T12:00:00Z");
  assert.equal(monthStreak(["2026-11", "2026-10", "2026-09"], now), 3);
  assert.equal(monthStreak(["2026-10", "2026-09"], now), 2);
  assert.equal(monthStreak(["2026-08"], now), 0);
  assert.deepEqual(
    earnedBadges({ orders: 5, dishes: 1, referrals: 0, visits: 0, flash: 1, reviews: 0 }),
    ["premiere-commande", "habitue-5", "leve-tot"],
  );
});

before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  for (const [id, name] of [
    ["client-a", "Alice Martin"],
    ["client-b", "Bruno Petit"],
  ])
    await db.query(
      "INSERT INTO profiles(id,name,role,email) VALUES($1,$2,'WAITER',$3)",
      [id, name, `${id}@example.test`],
    );
});
after(async () => {
  await db.close();
});

const actorOf = (id: string, name: string): Actor => ({
  id,
  name,
  role: "WAITER",
  email: `${id}@example.test`,
});

test("parcours : parrainage, promo flash, points de commande et de visite", async () => {
  const shop = commerce(R);
  await shop.updateSettings(db, owner, {
    open: true,
    prepMinutes: 5,
    interval: 5,
    capacity: 20,
    hours: Array.from({ length: 7 }, (_, day) => ({ day, open: "00:00", close: "23:59" })),
    categories: ["Entrées", "Plats", "Desserts", "Boissons"],
    address: "Test",
    phone: "",
    logo: "",
  });
  await db.transaction((tx) =>
    saveEngagementSettings(tx, R, owner, {
      action: "engagementSettings",
      points_per_euro: 1,
      booking_points: 20,
      referrer_points: 100,
      welcome_kind: "fixed",
      welcome_value: 500,
      welcome_days: 30,
      milestones: [{ count: 1, points: 50, label: "Premier ami" }],
    }),
  );
  const alice = actorOf("client-a", "Alice Martin"),
    bruno = actorOf("client-b", "Bruno Petit");
  const a = await db.transaction((tx) => customerForActor(tx, R, alice));
  const b = await db.transaction((tx) => customerForActor(tx, R, bruno));

  // A referral link needs the loyalty programme.
  await assert.rejects(db.transaction((tx) => ensureReferralCode(tx, R, a)), /fidélité/);
  await db.query("UPDATE customers SET consent=true WHERE id IN ($1,$2)", [a, b]);
  const code = await db.transaction((tx) => ensureReferralCode(tx, R, a));
  assert.match(code, /^[A-Z0-9]{8}$/);
  assert.equal(await db.transaction((tx) => ensureReferralCode(tx, R, a)), code);

  await assert.rejects(
    db.transaction((tx) => attachCustomerReferral(tx, R, a, alice, code)),
    /propre lien/,
  );
  const attached = await db.transaction((tx) => attachCustomerReferral(tx, R, b, bruno, code));
  assert.equal(attached.attached, true);
  assert.match(attached.welcome ?? "", /^BIENVENUE-/);
  const again = await db.transaction((tx) => attachCustomerReferral(tx, R, b, bruno, code));
  assert.equal(again.attached, false);

  // Flash promotion: the server applies the price, the client total is ignored.
  const regular = (
    await one<{ price: number }>(db, "SELECT price FROM menu_items WHERE id='bernay-Boissons-0'")
  ).price;
  const flashId = await db.transaction((tx) =>
    createFlashPromotion(tx, R, owner, {
      action: "flashPromotion",
      menu: "bernay-Boissons-0",
      kind: "percent",
      value: 30,
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
      member_bonus_points: 5,
    }),
  );
  const catalog = await shop.catalog(db);
  const drink = catalog.products.find((p) => p.id === "bernay-Boissons-0");
  assert.equal(drink?.price, flashPrice(regular, { kind: "percent", value: 30 }));
  assert.equal(drink?.flash?.regular_price, regular);

  const slot = (await shop.slots(db))[0];
  const order = await db.transaction((tx) =>
    shop.checkout(
      tx,
      {
        key: randomUUID(),
        customer: "Bruno Petit",
        email: bruno.email,
        consumption: "takeaway",
        payment: "counter",
        termsAccepted: true,
        loyaltyConsent: true,
        slot,
        items: [{ menu: "bernay-Boissons-0", quantity: 2, choices: [], note: "" }],
        total: 1,
      },
      b,
    ),
  );
  const flashTotal = 2 * flashPrice(regular, { kind: "percent", value: 30 });
  assert.equal(order.total, flashTotal);

  // Paid → order points + member flash bonus, once; the referrer is rewarded.
  await db.transaction((tx) => shop.settle(tx, order.order_id, "card", owner));
  const expected = orderPoints(flashTotal, 1) + 2 * 5;
  const pointsOf = async (id: string) =>
    (await one<{ points: number }>(db, "SELECT points FROM customers WHERE id=$1", [id])).points;
  assert.equal(await pointsOf(b), expected);
  assert.equal(await pointsOf(a), 100 + 50);
  assert.equal(await db.transaction((tx) => awardOrderPoints(tx, R, order.order_id)), 0);
  assert.equal(await db.transaction((tx) => settleReferral(tx, R, b)), false);
  assert.equal(await pointsOf(b), expected);
  assert.equal(await pointsOf(a), 150);
  assert.equal((await shop.receipt(db, order.token)).points_awarded, expected);
  const badges = await rows<{ badge: string }>(
    db,
    "SELECT badge FROM customer_badges WHERE customer_id=$1 ORDER BY badge",
    [b],
  );
  assert.deepEqual(badges.map((x) => x.badge), ["leve-tot", "premiere-commande"]);

  // Stopped flash promotion: regular price again.
  await db.transaction((tx) => stopFlashPromotion(tx, R, owner, flashId));
  assert.equal(
    (await shop.catalog(db)).products.find((p) => p.id === "bernay-Boissons-0")?.price,
    regular,
  );

  // Booking linked to the account: points on arrival, once.
  const booking = randomUUID();
  await db.query(
    "INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at,status,customer_id) VALUES($1,$2,'Bruno','x',2,now(),now()+interval '2 hours','arrived',$3)",
    [booking, R, b],
  );
  assert.equal(await db.transaction((tx) => awardBookingPoints(tx, R, booking)), 20);
  await db.transaction((tx) => awardBookingPoints(tx, R, booking));
  assert.equal(await pointsOf(b), expected + 20);

  // Account view and reward exchange still work together.
  const account = await shop.customerAccountForCustomer(db, b);
  assert.equal(account.engagement.level.lifetime, expected + 20);
  assert.equal(account.engagement.welcome?.code, attached.welcome);
  assert.ok(account.engagement.badges.some((x) => x.key === "a-table" && x.earned_at));
  const referrer = await shop.customerAccountForCustomer(db, a);
  assert.equal(referrer.engagement.referral.rewarded, 1);
  assert.deepEqual(referrer.engagement.referral.friends.map((f) => f.name), ["Bruno"]);
  const reward = randomUUID();
  await db.query(
    "INSERT INTO loyalty_rewards(id,restaurant_id,name,points_cost,kind,value) VALUES($1,$2,'Café offert',10,'fixed',200)",
    [reward, R],
  );
  const gift = await db.transaction((tx) =>
    claimReward(tx, R, bruno, { reward, key: randomUUID() }),
  );
  assert.match(gift.code, /^CADEAU-/);
  assert.equal(await pointsOf(b), expected + 20 - 10);
});
