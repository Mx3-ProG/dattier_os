import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";

test("installation is tenant scoped, reversible and does not touch a paid or included right", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const installed = async (restaurant: string, addon: string) =>
      (await db.query<{ active: boolean }>("SELECT app.addon_installed($1,$2) AS active", [restaurant, addon])).rows[0].active;
    const entitled = async (restaurant: string, addon: string) =>
      (await db.query<{ active: boolean }>("SELECT app.addon_entitled($1,$2) AS active", [restaurant, addon])).rows[0].active;
    const set = (user: string, restaurant: string, addon: string, desired: boolean) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)", [user, restaurant]);
      await tx.query("SELECT app.addon_installation_set($1,$2,$3)", [restaurant, addon, desired]);
    });

    assert.equal(await installed("bernay", "loyalty"), true);
    await assert.rejects(set("sarah", "bernay", "loyalty", false), /super admin/);
    await assert.rejects(set("nadia", "bernay", "unknown", false), /pas disponible/);
    await set("nadia", "bernay", "loyalty", false);
    assert.equal(await entitled("bernay", "loyalty"), true);
    assert.equal(await installed("bernay", "loyalty"), false);
    assert.equal(await installed("atelier", "loyalty"), true);
    await set("nadia", "bernay", "loyalty", true);
    assert.equal(await installed("bernay", "loyalty"), true);

    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)");
      await tx.query("SELECT app.addon_install_free('bernay','magic-loader')");
    });
    await set("nadia", "bernay", "magic-loader", false);
    assert.equal(await entitled("bernay", "magic-loader"), true);
    assert.equal(await installed("bernay", "magic-loader"), false);
    await set("nadia", "bernay", "magic-loader", true);
    assert.equal(await installed("bernay", "magic-loader"), true);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM addon_purchases WHERE restaurant_id='bernay' AND product_id='magic-loader'")).rows[0].count, 0);
  } finally { await db.close(); }
});

test("floor and booking cannot be removed during active work or in the wrong order", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    await db.query("UPDATE reservations SET status='cancelled' WHERE restaurant_id='bernay' AND status IN ('requested','confirmed','arrived')");
    const set = (addon: string, desired: boolean) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)");
      await tx.query("SELECT app.addon_installation_set('bernay',$1,$2)", [addon, desired]);
    });
    await assert.rejects(set("floor", false), /réservations/);
    await set("booking", false);
    await db.query("INSERT INTO table_sessions(id,table_id) VALUES('install-test-session','bernay-t1')");
    await assert.rejects(set("floor", false), /services de table/);
    await db.query("UPDATE table_sessions SET closed_at=now() WHERE id='install-test-session'");
    await db.query("UPDATE orders SET status='cancelled' WHERE restaurant_id='bernay' AND status IN ('pending','active')");
    await db.query("UPDATE table_sessions SET closed_at=now() WHERE closed_at IS NULL AND table_id IN (SELECT id FROM dining_tables WHERE restaurant_id='bernay')");
    await set("floor", false);
    assert.equal((await db.query<{ active: boolean }>("SELECT app.module_enabled('bernay','floor') AS active")).rows[0].active, false);
    await assert.rejects(set("booking", true), /plan de salle/);
    await set("floor", true);
    await set("booking", true);
    assert.equal((await db.query<{ active: boolean }>("SELECT app.module_enabled('bernay','table-booking') AS active")).rows[0].active, true);
  } finally { await db.close(); }
});
