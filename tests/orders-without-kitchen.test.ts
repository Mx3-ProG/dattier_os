import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { one, rows } from "../src/infrastructure/database/db";
import { changeItem, createOrder } from "../src/features/orders/service";
import type { Actor } from "../src/infrastructure/auth/session";

const R = "bernay";
const owner: Actor = { id: "nadia", name: "Nadia", role: "OWNER" };

async function setup() {
  const db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  const dish = await one<{ id: string }>(db,
    "SELECT m.id FROM menu_items m WHERE m.restaurant_id=$1 AND m.station='kitchen' AND m.enabled AND m.archived_at IS NULL AND EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id) AND NOT EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id AND coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=r.ingredient_id AND l.expires_on>=CURRENT_DATE),0)<r.quantity) ORDER BY m.id LIMIT 1",
    [R]);
  const table = await one<{ id: string }>(db,
    "SELECT id FROM dining_tables t WHERE restaurant_id=$1 AND status='free' AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.closed_at IS NULL) ORDER BY number LIMIT 1",
    [R]);
  const order = await db.transaction((tx) => createOrder(tx, {
    restaurant: R, table: table.id, channel: "staff", customer: "", contact: "",
    key: randomUUID(), items: [{ menu: dish.id, quantity: 1, note: "" }],
  }, owner));
  const [line] = await rows<{ id: string }>(db, "SELECT id FROM order_items WHERE order_id=$1", [order]);
  const stock = async () => (await one<{ physical: number; reserved: number }>(db,
    "SELECT sum(l.quantity)::float AS physical,sum(l.reserved)::float AS reserved FROM stock_lots l JOIN stock_reservations s ON s.lot_id=l.id WHERE s.item_id=$1",
    [line.id]));
  return { db, line: line.id, stock };
}

test("with the kitchen module, a line cannot skip preparation", async () => {
  const { db, line } = await setup();
  try {
    await assert.rejects(db.transaction((tx) => changeItem(tx, R, line, "served", owner)), /Transition de préparation/);
  } finally {
    await db.close();
  }
});

test("without the kitchen module, a line is served directly and consumes its stock once", async () => {
  const { db, line, stock } = await setup();
  try {
    // La Cuisine est ouverte à tous les métiers : on simule ici un établissement
    // qui ne l'a pas (future offre à la carte) en masquant ce seul module.
    await db.exec(`ALTER FUNCTION app.module_available(text,text) RENAME TO module_available_base;
      CREATE FUNCTION app.module_available(rid text, module text) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT module<>'kitchen' AND app.module_available_base(rid,module) $$;`);
    const before = await stock();
    assert.ok(before.reserved > 0);
    await db.transaction((tx) => changeItem(tx, R, line, "served", owner));
    const after = await stock();
    const item = await one<{ status: string }>(db, "SELECT status FROM order_items WHERE id=$1", [line]);
    assert.equal(item.status, "served");
    // Réservé et physique baissent ensemble, exactement comme au début de préparation.
    assert.ok(Math.abs((before.physical - after.physical) - before.reserved) < 1e-9);
    assert.equal(after.reserved, 0);
    const reservations = await rows<{ status: string }>(db, "SELECT status FROM stock_reservations WHERE item_id=$1", [line]);
    assert.ok(reservations.every((reservation) => reservation.status === "consumed"));
    const moves = await rows<{ reason: string }>(db, "SELECT reason FROM stock_movements WHERE reference=$1", [line]);
    assert.ok(moves.some((move) => move.reason === "Service direct"));
  } finally {
    await db.close();
  }
});
