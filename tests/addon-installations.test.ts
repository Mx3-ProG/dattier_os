import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";

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

test("bookings work without the floor plan; the floor plan cannot leave live work behind", async () => {
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
    const enabled = async (module: string) =>
      (await db.query<{ active: boolean }>("SELECT app.module_enabled('bernay',$1) AS active", [module])).rows[0].active;
    const book = (id: string, table: string | null) => db.query(
      "INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at,table_id) VALUES($1,'bernay','Test','test@example.test',2,now()+interval '2 days',now()+interval '2 days 2 hours',$2)",
      [id, table],
    );

    const closeService = async () => {
      await db.query("UPDATE orders SET status='cancelled' WHERE restaurant_id='bernay' AND status IN ('pending','active')");
      await db.query("UPDATE table_sessions SET closed_at=now() WHERE closed_at IS NULL AND table_id IN (SELECT id FROM dining_tables WHERE restaurant_id='bernay')");
    };
    // Un service de table en cours bloque le retrait du plan de salle.
    await db.query("INSERT INTO table_sessions(id,table_id) VALUES('install-test-session','bernay-t1')");
    await assert.rejects(set("floor", false), /services de table/);
    await closeService();
    // Une réservation à venir avec une table aussi.
    await book("install-test-table", "bernay-t1");
    await assert.rejects(set("floor", false), /tables attribuées/);
    await db.query("UPDATE reservations SET status='cancelled' WHERE id='install-test-table'");

    // Plan de salle retiré : les réservations restent actives, sans table.
    await set("floor", false);
    assert.equal(await enabled("floor"), false);
    assert.equal(await enabled("table-booking"), true);
    await assert.rejects(book("install-test-floorless-table", "bernay-t2"), /plan de salle/);
    await book("install-test-floorless", null);
    await assert.rejects(set("booking", false), /réservations à venir/);
    await db.query("UPDATE reservations SET status='cancelled' WHERE id='install-test-floorless'");
    await set("booking", false);
    assert.equal(await enabled("table-booking"), false);
    // Les réservations se réinstallent sans plan de salle.
    await set("booking", true);
    assert.equal(await enabled("table-booking"), true);
    await set("floor", true);
    assert.equal(await enabled("floor"), true);
  } finally { await db.close(); }
});
