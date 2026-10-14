import { migrate } from "../src/lib/database/migrate";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { seed } from "../src/lib/database/seed";
import { rows, one } from "../src/lib/database/db";
import {
  orderSchema,
  createOrder,
  changeItem,
  pay,
} from "../src/features/orders/service";
import {
  perform,
  requestReservation,
  reservationSchema,
} from "../src/lib/actions";
import { snapshot, menu } from "../src/lib/snapshot";
import { scope, type Actor } from "../src/lib/auth/session";
let db: PGlite;
const sarah: Actor = { id: "sarah", name: "Sarah", role: "WAITER" },
  karim: Actor = { id: "karim", name: "Karim", role: "CHEF" },
  youssef: Actor = { id: "youssef", name: "Youssef", role: "BARTENDER" },
  nadia: Actor = { id: "nadia", name: "Nadia", role: "OWNER" };
const input = (quantity = 2, key = randomUUID(), table = "bernay-t8") =>
  orderSchema.parse({
    restaurant: "bernay",
    table,
    key,
    items: [
      { menu: "bernay-Plats-0", quantity },
      { menu: "bernay-Boissons-0", quantity },
    ],
  });
const stock = () =>
  one<{ quantity: number; reserved: number }>(
    db,
    "SELECT quantity::float,reserved::float FROM stock_lots WHERE id='bernay-semoule-lot'",
  );
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(async () => {
  await db.close();
});
test("parcours Sarah → Karim → Youssef → service → règlement et stocks", async () => {
  const before = await stock();
  const id = await db.transaction((tx) => createOrder(tx, input(), sarah));
  assert.equal((await stock()).reserved, before.reserved + 400);
  const items = await rows<{ id: string; station: string }>(
    db,
    "SELECT * FROM order_items WHERE order_id=$1",
    [id],
  );
  assert.equal(items.length, 2);
  for (const item of items) {
    const user = item.station === "bar" ? youssef : karim;
    await db.transaction((tx) =>
      changeItem(tx, "bernay", item.id, "preparing", user),
    );
    await db.transaction((tx) =>
      changeItem(tx, "bernay", item.id, "ready", user),
    );
    await db.transaction((tx) =>
      changeItem(tx, "bernay", item.id, "served", sarah),
    );
  }
  await db.transaction((tx) => pay(tx, "bernay", id, "card", sarah));
  await db.transaction((tx) => pay(tx, "bernay", id, "card", sarah));
  assert.equal((await stock()).quantity, before.quantity - 400);
  assert.equal((await stock()).reserved, before.reserved);
  assert.equal(
    (
      await one<{ status: string }>(
        db,
        "SELECT status FROM orders WHERE id=$1",
        [id],
      )
    ).status,
    "paid",
  );
  assert.equal(
    (
      await one<{ amount: number }>(
        db,
        "SELECT amount FROM payment_declarations WHERE session_id=(SELECT session_id FROM orders WHERE id=$1)",
        [id],
      )
    ).amount,
    5100,
  );
});
test("idempotence et annulation avant/après consommation", async () => {
  const before = await stock(),
    data = input(1, randomUUID(), "bernay-t9");
  const id = await db.transaction((tx) => createOrder(tx, data, sarah));
  assert.equal(await db.transaction((tx) => createOrder(tx, data, sarah)), id);
  const items = await rows<{ id: string; station: string }>(
    db,
    "SELECT * FROM order_items WHERE order_id=$1",
    [id],
  );
  const food = items.find((i) => i.station === "kitchen")!;
  await db.transaction((tx) =>
    changeItem(tx, "bernay", food.id, "preparing", karim),
  );
  await db.transaction((tx) =>
    changeItem(tx, "bernay", food.id, "cancelled", sarah),
  );
  await db.transaction((tx) =>
    changeItem(
      tx,
      "bernay",
      items.find((i) => i.station === "bar")!.id,
      "cancelled",
      sarah,
    ),
  );
  assert.equal((await stock()).quantity, before.quantity - 200);
  assert.equal((await stock()).reserved, before.reserved);
  assert.ok(
    (
      await rows(
        db,
        "SELECT * FROM stock_movements WHERE reference=$1 AND type='waste'",
        [food.id],
      )
    ).length,
  );
});
test("deux commandes concurrentes ne sur-réservent pas le stock", async () => {
  await db.query(
    "UPDATE stock_lots SET quantity=reserved+200 WHERE id='bernay-semoule-lot'",
  );
  const result = await Promise.allSettled([
    db.transaction((tx) =>
      createOrder(tx, input(1, randomUUID(), "bernay-t10"), sarah),
    ),
    db.transaction((tx) =>
      createOrder(tx, input(1, randomUUID(), "bernay-t11"), sarah),
    ),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(result.filter((r) => r.status === "rejected").length, 1);
  const s = await stock();
  assert.ok(s.reserved <= s.quantity);
  await db.query(
    "UPDATE stock_lots SET quantity=reserved+30000 WHERE id='bernay-semoule-lot'",
  );
});
test("permissions et isolation serveur, données financières masquées", async () => {
  await assert.rejects(
    db.transaction((tx) =>
      createOrder(tx, input(), {
        id: "leila",
        name: "Leïla",
        role: "ACCOUNTANT",
      }),
    ),
    /refusé/,
  );
  await assert.rejects(scope(db, sarah, "atelier"), /autorisé/);
  const s = await db.transaction((tx) => snapshot(tx, karim, "bernay"));
  assert.equal(s.payments.length, 0);
  assert.equal(s.customers.length, 0);
  assert.equal(s.menu[0].cost, undefined);
  await assert.rejects(
    db.transaction((tx) =>
      perform(tx, "bernay", sarah, {
        action: "expense",
        label: "Interdit",
        amount: 100,
      }),
    ),
    /refusé/,
  );
});
test("réception partielle, correction inventaire et stock expiré exclu", async () => {
  await db.transaction((tx) =>
    perform(tx, "bernay", nadia, {
      action: "receive",
      id: "bernay-purchase",
      quantity: 15000,
      expires: "2099-12-31",
    }),
  );
  const p = await one<{ received: number; status: string }>(
    db,
    "SELECT received::float,status FROM purchase_orders WHERE id='bernay-purchase'",
  );
  assert.equal(p.received, 15000);
  assert.equal(p.status, "partial");
  await assert.rejects(
    db.transaction((tx) =>
      perform(tx, "bernay", nadia, {
        action: "receive",
        id: "bernay-purchase",
        quantity: 6000,
        expires: "2099-12-31",
      }),
    ),
  );
  const before = await stock();
  await db.transaction((tx) =>
    perform(tx, "bernay", nadia, {
      action: "stock",
      id: "bernay-semoule-lot",
      quantity: before.quantity + 100,
      reason: "Comptage test",
      kind: "inventory",
    }),
  );
  assert.equal((await stock()).quantity, before.quantity + 100);
  await db.query(
    "UPDATE stock_lots SET expires_on=CURRENT_DATE-1 WHERE ingredient_id='bernay-the'",
  );
  const tea = (await menu(db, "bernay")).find(
    (m) => m.id === "bernay-Boissons-0",
  );
  assert.equal(tea?.portions, 0);
  await assert.rejects(
    db.transaction((tx) => createOrder(tx, input(), sarah)),
    /insuffisant|indisponible/,
  );
});
test("réservation publique et conflit de table", async () => {
  const start = new Date(Date.now() + 86400000 * 5).toISOString();
  const res = reservationSchema.parse({
    restaurant: "bernay",
    name: "Test fictif",
    contact: "test@example.test",
    guests: 2,
    start,
  });
  const a = await db.transaction((tx) => requestReservation(tx, res));
  const b = await db.transaction((tx) => requestReservation(tx, res));
  await db.transaction((tx) =>
    perform(tx, "bernay", sarah, {
      action: "reservation",
      id: a,
      status: "confirmed",
      table: "bernay-t1",
    }),
  );
  await assert.rejects(
    db.transaction((tx) =>
      perform(tx, "bernay", sarah, {
        action: "reservation",
        id: b,
        status: "confirmed",
        table: "bernay-t1",
      }),
    ),
    /réservée/,
  );
  assert.ok(
    (await snapshot(db, sarah, "bernay")).reservations.some((r) => r.id === a),
  );
});

test("commandes successives regroupées dans une addition et QR sans session refusé", async () => {
  await db.query(
    "UPDATE stock_lots SET expires_on=CURRENT_DATE+14 WHERE ingredient_id='bernay-the'",
  );
  const first = await db.transaction((tx) =>
    createOrder(tx, input(1, randomUUID(), "bernay-t12"), sarah),
  );
  const second = await db.transaction((tx) =>
    createOrder(tx, input(1, randomUUID(), "bernay-t12"), sarah),
  );
  const all = await rows<{ id: string; station: string }>(
    db,
    "SELECT * FROM order_items WHERE order_id IN ($1,$2)",
    [first, second],
  );
  for (const i of all) {
    const user = i.station === "bar" ? youssef : karim;
    await db.transaction((tx) =>
      changeItem(tx, "bernay", i.id, "preparing", user),
    );
    await db.transaction((tx) => changeItem(tx, "bernay", i.id, "ready", user));
    await db.transaction((tx) =>
      changeItem(tx, "bernay", i.id, "served", sarah),
    );
  }
  await db.transaction((tx) => pay(tx, "bernay", second, "cash", sarah));
  assert.equal(
    (
      await one<{ amount: number }>(
        db,
        "SELECT amount FROM payment_declarations WHERE session_id=(SELECT session_id FROM orders WHERE id=$1)",
        [first],
      )
    ).amount,
    5100,
  );
  assert.equal(
    (
      await one<{ status: string }>(
        db,
        "SELECT status FROM orders WHERE id=$1",
        [first],
      )
    ).status,
    "paid",
  );
  const qr = orderSchema.parse({
    restaurant: "bernay",
    channel: "qr",
    customer: "Client fictif",
    contact: "demo@example.test",
    key: randomUUID(),
    items: [{ menu: "bernay-Plats-0", quantity: 1 }],
  });
  await assert.rejects(
    db.transaction((tx) => createOrder(tx, qr, null)),
    /table/,
  );
});
