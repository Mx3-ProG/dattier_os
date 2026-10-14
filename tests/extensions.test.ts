import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows } from "../src/lib/database/db";
import { snapshot, menu } from "../src/lib/snapshot";
import { perform, actionSchema } from "../src/lib/actions";
import {
  createOrder,
  changeItem,
  pay,
  orderSchema,
} from "../src/features/orders/service";
import type { Actor } from "../src/lib/auth/session";
let db: PGlite;
const owner: Actor = { id: "nadia", name: "Nadia", role: "OWNER" },
  manager: Actor = { id: "lina", name: "Lina", role: "MANAGER" },
  chef: Actor = { id: "karim", name: "Karim", role: "CHEF" },
  bar: Actor = { id: "youssef", name: "Youssef", role: "BARTENDER" },
  waiter: Actor = { id: "sarah", name: "Sarah", role: "WAITER" };
const act = (user: Actor, input: unknown) =>
  db.transaction((tx) =>
    perform(tx, "bernay", user, actionSchema.parse(input)),
  );
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await db.query(
    "INSERT INTO restaurants(id,name) VALUES('preserved','Données existantes')",
  );
  await migrate(db);
  await migrate(db);
  assert.equal(
    (
      await one<{ name: string }>(
        db,
        "SELECT name FROM restaurants WHERE id='preserved'",
      )
    ).name,
    "Données existantes",
  );
  await db.transaction(seed);
});
after(async () => db.close());
test("manager : créer avec recette, archiver, restaurer et supprimer sans historique", async () => {
  const id = (await act(manager, {
    action: "createProduct",
    name: "Produit test",
    category: "Boissons",
    price: 500,
    station: "bar",
    description: "Fictif",
    ingredients: [{ id: "bernay-boisson", quantity: 1 }],
  })) as string;
  assert.ok((await menu(db, "bernay")).some((m) => m.id === id));
  await act(manager, { action: "productLifecycle", id, operation: "archive" });
  assert.ok(!(await menu(db, "bernay")).some((m) => m.id === id));
  assert.ok(
    (await snapshot(db, manager, "bernay")).menu.find((m) => m.id === id)
      ?.archived_at,
  );
  await assert.rejects(
    db.transaction((tx) =>
      createOrder(
        tx,
        orderSchema.parse({
          restaurant: "bernay",
          table: "bernay-t8",
          key: randomUUID(),
          items: [{ menu: id, quantity: 1 }],
        }),
        chef,
      ),
    ),
  );
  await act(manager, { action: "productLifecycle", id, operation: "restore" });
  await act(manager, { action: "productLifecycle", id, operation: "delete" });
  assert.equal(
    (await rows(db, "SELECT id FROM menu_items WHERE id=$1", [id])).length,
    0,
  );
  await assert.rejects(
    act(manager, {
      action: "productLifecycle",
      id: "bernay-Plats-0",
      operation: "delete",
    }),
    /historique/,
  );
  await assert.rejects(
    act(chef, {
      action: "productLifecycle",
      id: "bernay-Plats-0",
      operation: "archive",
    }),
    /refusé/,
  );
  await assert.rejects(
    act(manager, {
      action: "createProduct",
      name: "Croisé",
      category: "Plats",
      price: 500,
      station: "kitchen",
      ingredients: [{ id: "atelier-poulet", quantity: 1 }],
    }),
  );
});
async function served(user: Actor, table: string) {
  const id = await db.transaction((tx) =>
    createOrder(
      tx,
      orderSchema.parse({
        restaurant: "bernay",
        table,
        key: randomUUID(),
        items: [{ menu: "bernay-Boissons-0", quantity: 2 }],
      }),
      user,
    ),
  );
  for (const i of await rows<{ id: string }>(
    db,
    "SELECT id FROM order_items WHERE order_id=$1",
    [id],
  )) {
    await db.transaction((tx) =>
      changeItem(tx, "bernay", i.id, "preparing", bar),
    );
    await db.transaction((tx) => changeItem(tx, "bernay", i.id, "ready", bar));
    await db.transaction((tx) =>
      changeItem(tx, "bernay", i.id, "served", user),
    );
  }
  return id;
}
const promo = (code: string, points = 20) => ({
  action: "issuePromo",
  customer: "bernay-customer",
  code,
  kind: "percent",
  value: 10,
  points,
  expires: "2099-12-31",
});
test("cuisine et bar prennent des commandes sous leur identité, sans pouvoir régler", async () => {
  const a = await served(chef, "bernay-t8");
  assert.equal(
    (
      await one<{ created_by: string }>(
        db,
        "SELECT created_by FROM orders WHERE id=$1",
        [a],
      )
    ).created_by,
    "karim",
  );
  assert.equal((await snapshot(db, chef, "bernay")).tables.length, 12);
  await assert.rejects(
    db.transaction((tx) => pay(tx, "bernay", a, "card", chef)),
    /refusé/,
  );
  const b = await served(bar, "bernay-t9");
  assert.equal(
    (
      await one<{ created_by: string }>(
        db,
        "SELECT created_by FROM orders WHERE id=$1",
        [b],
      )
    ).created_by,
    "youssef",
  );
});
test("code nominatif : points atomiques, remise appliquée, une utilisation, historique net", async () => {
  await act(owner, promo("CLIENT-10"));
  assert.equal(
    (
      await one<{ points: number }>(
        db,
        "SELECT points FROM customers WHERE id='bernay-customer'",
      )
    ).points,
    20,
  );
  await assert.rejects(act(owner, promo("TROP", 21)), /insuffisant/);
  await assert.rejects(act(owner, promo("CLIENT-10", 0)));
  assert.equal(
    (
      await one<{ points: number }>(
        db,
        "SELECT points FROM customers WHERE id='bernay-customer'",
      )
    ).points,
    20,
  );
  const order = await one<{ id: string }>(
    db,
    "SELECT o.id FROM orders o JOIN table_sessions s ON s.id=o.session_id WHERE s.table_id='bernay-t8'",
  );
  await assert.rejects(
    db.transaction((tx) =>
      pay(
        tx,
        "bernay",
        order.id,
        "card",
        waiter,
        "atelier-customer",
        "CLIENT-10",
      ),
    ),
  );
  await db.transaction((tx) =>
    pay(tx, "bernay", order.id, "card", waiter, "bernay-customer", "CLIENT-10"),
  );
  await db.transaction((tx) =>
    pay(tx, "bernay", order.id, "card", waiter, "bernay-customer", "CLIENT-10"),
  );
  const p = await one<{ amount: number; discount: number }>(
    db,
    "SELECT amount,discount FROM payment_declarations WHERE session_id=(SELECT session_id FROM orders WHERE id=$1)",
    [order.id],
  );
  assert.equal(p.amount, 630);
  assert.equal(p.discount, 70);
  const other = await one<{ id: string }>(
    db,
    "SELECT o.id FROM orders o JOIN table_sessions s ON s.id=o.session_id WHERE s.table_id='bernay-t9'",
  );
  await assert.rejects(
    db.transaction((tx) =>
      pay(
        tx,
        "bernay",
        other.id,
        "card",
        waiter,
        "bernay-customer",
        "CLIENT-10",
      ),
    ),
    /déjà utilisé/,
  );
  assert.equal((await snapshot(db, waiter, "bernay")).promos.length, 0);
});
test("annulation restitue une fois les points ; codes expirés ou sans consentement refusés", async () => {
  await act(manager, promo("ANNULE", 10));
  const p = await one<{ id: string }>(
    db,
    "SELECT id FROM promo_codes WHERE code='ANNULE'",
  );
  await act(manager, { action: "cancelPromo", id: p.id });
  await act(manager, { action: "cancelPromo", id: p.id });
  assert.equal(
    (
      await one<{ points: number }>(
        db,
        "SELECT points FROM customers WHERE id='bernay-customer'",
      )
    ).points,
    20,
  );
  await assert.rejects(
    act(manager, { ...promo("EXPIRE", 0), expires: "2000-01-01" }),
  );
  await db.query(
    "UPDATE customers SET consent=false WHERE id='bernay-customer'",
  );
  await assert.rejects(act(manager, promo("CONSENT", 0)), /consentement/);
  await db.query(
    "UPDATE customers SET consent=true WHERE id='bernay-customer'",
  );
});
test("remise fixe plafonnée à l’addition, règlement nul et code expiré à l’usage", async () => {
  await act(owner, { ...promo("OFFERT", 0), kind: "fixed", value: 1000 });
  const id = await served(chef, "bernay-t10");
  await db.transaction((tx) =>
    pay(tx, "bernay", id, "card", waiter, "bernay-customer", "OFFERT"),
  );
  assert.equal(
    (
      await one<{ amount: number }>(
        db,
        "SELECT amount FROM payment_declarations WHERE session_id=(SELECT session_id FROM orders WHERE id=$1)",
        [id],
      )
    ).amount,
    0,
  );
  await act(owner, promo("EXPIRATION", 0));
  await db.query(
    "UPDATE promo_codes SET expires_on=CURRENT_DATE-1 WHERE code='EXPIRATION'",
  );
  const other = await served(bar, "bernay-t11");
  await assert.rejects(
    db.transaction((tx) =>
      pay(tx, "bernay", other, "card", waiter, "bernay-customer", "EXPIRATION"),
    ),
    /expiré/,
  );
});
