import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { scope, type Actor } from "../src/lib/auth/session";
import { perform } from "../src/lib/actions";
import {
  hashPin,
  resetPin,
  setOwnPin,
  staffState,
  verifyOperator,
  verifyPinHash,
  weakPin,
} from "../src/features/team/pins";
import { deniedFor, saveVisibility } from "../src/features/team/visibility";
import { can } from "../src/lib/permissions";
import { requiresPin } from "../src/features/team/steps";

const R = "bernay";
const nadia: Actor = { id: "nadia", name: "Nadia", role: "OWNER" };
const sarah: Actor = { id: "sarah", name: "Sarah", role: "WAITER" };
const lina: Actor = { id: "lina", name: "Lina", role: "MANAGER" };

async function setup() {
  const db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  await db.query("UPDATE restaurants SET staff_pin_required=true WHERE id=$1", [R]);
  const as = async (user: Actor) =>
    db.query("SELECT set_config('app.user_id',$1,false),set_config('app.restaurant_id',$2,false)", [user.id, R]);
  const orderInput = async () => {
    const dish = await one<{ id: string }>(db,
      "SELECT m.id FROM menu_items m WHERE m.restaurant_id=$1 AND m.station='kitchen' AND m.enabled AND m.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id AND coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=r.ingredient_id AND l.expires_on>=CURRENT_DATE),0)<r.quantity) ORDER BY m.id LIMIT 1",
      [R]);
    const table = await one<{ id: string }>(db,
      "SELECT id FROM dining_tables t WHERE restaurant_id=$1 AND status='free' AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.closed_at IS NULL) ORDER BY number LIMIT 1",
      [R]);
    return {
      action: "order" as const,
      data: {
        restaurant: R, table: table.id, channel: "staff" as const, customer: "", contact: "",
        key: randomUUID(), items: [{ menu: dish.id, quantity: 2, note: "" }],
      },
    };
  };
  const tx = <T,>(fn: (t: DB) => Promise<T>) => db.transaction(fn);
  return { db, as, orderInput, tx };
}

test("PIN hashing rejects weak codes and never stores the code in clear", async () => {
  assert.ok(weakPin("0000"));
  assert.ok(weakPin("1234"));
  assert.ok(weakPin("98765"));
  assert.ok(!weakPin("2580"));
  const stored = await hashPin("2580");
  assert.ok(stored.startsWith("scrypt$") && !stored.includes("2580"));
  assert.ok(await verifyPinHash("2580", stored));
  assert.ok(!(await verifyPinHash("2581", stored)));
});

test("the interface asks for a PIN on the same steps as the server", () => {
  assert.ok(requiresPin({ action: "order", data: { channel: "staff" } }));
  assert.ok(!requiresPin({ action: "order", data: { channel: "takeaway" } }));
  assert.ok(requiresPin({ action: "pay" }));
  assert.ok(requiresPin({ action: "item", status: "cancelled" }));
  assert.ok(!requiresPin({ action: "item", status: "served" }));
  assert.ok(requiresPin({ action: "confirmOrder", accept: false }));
});

test("an order taken on the owner's device is attributed to the waiter who typed her PIN", async () => {
  const { db, as, orderInput, tx } = await setup();
  try {
    await as(sarah);
    assert.equal((await staffState(db, R, sarah)).hasPin, false);
    await tx(async (t) => setOwnPin(t, R, sarah, { action: "setPin", code: "2580", confirm: "2580" }));
    assert.equal((await staffState(db, R, sarah)).hasPin, true);

    await as(nadia);
    const device = await tx((t) => scope(t, nadia, R));
    const input = await orderInput();
    await assert.rejects(tx((t) => perform(t, R, device, input)), /Code PIN requis/);

    const operator = await verifyOperator(tx, R, nadia, { profile: "sarah", code: "2580" });
    assert.equal(operator?.id, "sarah");
    const order = (await tx((t) => perform(t, R, device, input, operator))) as string;
    const saved = await one<{ created_by: string }>(db, "SELECT created_by FROM orders WHERE id=$1", [order]);
    assert.equal(saved.created_by, "sarah");
    const [entry] = await rows<{ profile_id: string; device_profile_id: string; kind: string; detail: string }>(db,
      "SELECT profile_id,device_profile_id,kind,detail FROM staff_activity WHERE object_id=$1", [order]);
    assert.deepEqual(
      { ...entry },
      { profile_id: "sarah", device_profile_id: "nadia", kind: "order", detail: "2 article(s)" },
    );
  } finally {
    await db.close();
  }
});

test("five wrong PINs lock the code; the failures survive and an admin reset unlocks it", async () => {
  const { db, as, tx } = await setup();
  try {
    await as(sarah);
    await tx((t) => setOwnPin(t, R, sarah, { action: "setPin", code: "2580", confirm: "2580" }));
    await as(nadia);
    for (let attempt = 1; attempt <= 4; attempt++)
      await assert.rejects(verifyOperator(tx, R, nadia, { profile: "sarah", code: "1111" }), /incorrect/);
    await assert.rejects(verifyOperator(tx, R, nadia, { profile: "sarah", code: "1111" }), /bloqué 15 minutes/);
    // Même le bon code est refusé pendant le blocage.
    await assert.rejects(verifyOperator(tx, R, nadia, { profile: "sarah", code: "2580" }), /bloqué jusqu/);
    const failures = await rows(db, "SELECT 1 FROM staff_activity WHERE profile_id='sarah' AND kind IN ('pin_failed','pin_locked')");
    assert.equal(failures.length, 5);

    await tx((t) => resetPin(t, R, nadia, "sarah"));
    assert.equal((await staffState(db, R, sarah)).hasPin, false);
  } finally {
    await db.close();
  }
});

test("without the PIN requirement, steps run as before but are still journaled", async () => {
  const { db, as, orderInput, tx } = await setup();
  try {
    await db.query("UPDATE restaurants SET staff_pin_required=false WHERE id=$1", [R]);
    await as(nadia);
    const device = await tx((t) => scope(t, nadia, R));
    assert.equal(await verifyOperator(tx, R, nadia, undefined), undefined);
    const input = await orderInput();
    const order = (await tx((t) => perform(t, R, device, input))) as string;
    const [entry] = await rows<{ profile_id: string }>(db, "SELECT profile_id FROM staff_activity WHERE object_id=$1", [order]);
    assert.equal(entry.profile_id, "nadia");
  } finally {
    await db.close();
  }
});

test("hiding every entry of a domain removes the right on the server, never for an owner", async () => {
  const { db, as, tx } = await setup();
  try {
    assert.deepEqual(deniedFor(["MANAGER"], ["orders"]), []);
    assert.deepEqual(deniedFor(["MANAGER"], ["orders", "dining"]), ["orders"]);

    await as(nadia);
    await tx((t) => saveVisibility(t, R, nadia, { action: "visibility", profile: "lina", hidden: ["orders", "dining", "unknown"] }));
    const saved = await one<{ hidden: string[]; denied: string[] }>(db,
      "SELECT hidden,denied FROM member_visibility WHERE restaurant_id=$1 AND profile_id='lina'", [R]);
    assert.deepEqual(saved.hidden, ["dining", "orders"]);
    assert.deepEqual(saved.denied, ["orders"]);

    await as(lina);
    const scoped = await tx((t) => scope(t, lina, R));
    assert.equal(can(scoped.roles!, "orders"), false);
    assert.equal(can(scoped.roles!, "catalog"), true);

    await as(nadia);
    await assert.rejects(
      tx((t) => saveVisibility(t, R, nadia, { action: "visibility", profile: "nadia", hidden: ["finance"] })),
      /propriétaire/,
    );
  } finally {
    await db.close();
  }
});
