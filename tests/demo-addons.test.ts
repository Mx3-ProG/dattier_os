import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { grantDemoAddons } from "../src/infrastructure/database/demo-addons";
import { monthlyAddonIds } from "../src/features/addons/catalog";

test("la démo donne accès à chaque add-on payant visible sans simuler un achat", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const before = await db.query<{ available: boolean }>("SELECT app.addon_installed('bernay','prospect-scanner') AS available");
    assert.equal(before.rows[0].available, false);
    await db.transaction(grantDemoAddons);
    await db.transaction(grantDemoAddons);
    for (const restaurant of ["bernay", "atelier"]) {
      for (const addon of monthlyAddonIds) {
        const result = await db.query<{ available: boolean }>("SELECT app.addon_installed($1,$2) AS available", [restaurant, addon]);
        assert.equal(result.rows[0].available, true, `${restaurant}: ${addon}`);
      }
      const missing = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM addon_products p
        WHERE p.listed AND p.sellable AND p.price_cents>0 AND p.pricing_mode IN ('one_time','subscription')
          AND NOT EXISTS (SELECT 1 FROM addon_licenses l WHERE l.restaurant_id=$1 AND l.product_id=p.id AND l.status='active')`, [restaurant]);
      assert.equal(missing.rows[0].count, 0);
      const fakePayments = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM addon_purchases WHERE restaurant_id=$1", [restaurant]);
      assert.equal(fakePayments.rows[0].count, 0);
    }
    const demoLicense = await db.query<{ source: string }>("SELECT source FROM addon_licenses WHERE restaurant_id='bernay' AND product_id='liquid-flow'");
    assert.equal(demoLicense.rows[0].source, "demo");
  } finally {
    await db.close();
  }
});

test("le rôle applicatif ne peut pas s'accorder un essai démo", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    await db.exec("SET ROLE atacuisine_app");
    await db.query("SELECT set_config('app.user_id','nadia',false),set_config('app.restaurant_id','bernay',false),set_config('app.public','false',false)");
    await assert.rejects(db.query("INSERT INTO addon_licenses(restaurant_id,product_id,source) VALUES('bernay','liquid-flow','demo')"));
    await assert.rejects(db.query("INSERT INTO addon_legacy_grants(restaurant_id,addon_id) VALUES('bernay','prospect-scanner')"));
  } finally {
    await db.close();
  }
});
