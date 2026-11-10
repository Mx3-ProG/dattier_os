import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { calculateEstimation, estimationSaveSchema } from "../src/features/estimation/model";

const item = { id: "3d9ae3c6-e998-4469-b0a9-44649b452777", kind: "service" as const,
  name: "Prestation", unit: "heure", priceCents: 12000, costCents: 4000,
  defaultQuantity: 2, maxQuantity: 20, featured: true };

test("estimation calculations keep missing costs explicit and validate quantities", () => {
  const result = calculateEstimation([item], { [item.id]: 3 }, 5000);
  assert.equal(result.revenueCents, 36000);
  assert.equal(result.totalCostCents, 17000);
  assert.equal(result.marginCents, 19000);
  assert.equal(calculateEstimation([{ ...item, costCents: null }], {}, 0).marginCents, null);
  assert.throws(() => calculateEstimation([item], { [item.id]: 21 }), /Quantité invalide/);
  assert.equal(estimationSaveSchema.safeParse({ title: "Test", introduction: "", items: [item], fixedCostsCents: 0, published: true, revision: 0 }).success, true);
});

test("only an installed establishment manager publishes, and public data omits costs", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const as = async (user: string, restaurant: string, publicMode = false) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('app.user_id',$1,false),set_config('app.restaurant_id',$2,false),set_config('app.public',$3,false)", [user, restaurant, String(publicMode)]);
      await db.exec("SET ROLE atacuisine_app");
    };
    const config = JSON.stringify([item]);
    await as("nadia", "bernay");
    await assert.rejects(db.query("SELECT app.estimation_save('bernay','Test','',$1::jsonb,0,true,0)", [config]), /add-on installé/);
    await db.query("SELECT app.addon_install_free('bernay','estimation-studio')");
    await db.query("SELECT app.addon_installation_set('bernay','estimation-studio',true)");
    await as("sarah", "bernay");
    await assert.rejects(db.query("SELECT app.estimation_save('bernay','Test','',$1::jsonb,0,true,0)", [config]), /super admin/);
    await as("nadia", "bernay");
    await db.query("SELECT app.estimation_save('bernay','Test','',$1::jsonb,5000,true,0)", [config]);
    await as("", "bernay", true);
    const publicView = (await db.query<{ value: Record<string, unknown> | null }>("SELECT app.estimation_public('bernay') AS value")).rows[0].value;
    assert.equal(publicView?.title, "Test");
    assert.equal(JSON.stringify(publicView).includes("costCents"), false);
    assert.equal(JSON.stringify(publicView).includes("fixedCosts"), false);
    assert.equal((await db.query("SELECT * FROM estimation_configs")).rows.length, 0);
    await as("nadia", "atelier");
    assert.equal((await db.query<{ value: unknown }>("SELECT app.estimation_public('atelier') AS value")).rows[0].value, null);
    await as("nadia", "bernay");
    await db.query("SELECT app.addon_installation_set('bernay','estimation-studio',false)");
    assert.equal((await db.query<{ value: unknown }>("SELECT app.estimation_public('bernay') AS value")).rows[0].value, null);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM estimation_configs WHERE restaurant_id='bernay'")).rows[0].count, 1);
  } finally { await db.close(); }
});
