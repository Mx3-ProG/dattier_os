import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { addonPriceCents } from "../src/features/addons/catalog";
import { customerHealthScore } from "../src/features/pilotage-addons/service";
import { nafCodes, scoreProspect } from "../src/features/pilotage-addons/scanner";
import { categoryCounts, defaultStoreFilters, featuresVisible, pilotageCategoryId } from "../src/features/addons/store-catalog";

test("Pilotage affiche les trois abonnements aux prix TTC et dans la bonne catégorie", () => {
  assert.equal(addonPriceCents("prospect-scanner"), 6900);
  assert.equal(addonPriceCents("pipeline-crm"), 6900);
  assert.equal(addonPriceCents("customer-health"), 8900);
  assert.equal(featuresVisible({ ...defaultStoreFilters, category: pilotageCategoryId }), true);
  assert.deepEqual(categoryCounts([], [], defaultStoreFilters, 7, 3), {
    features: 4, "pilotage-tools": 3, all: 7,
  });
  assert.deepEqual(categoryCounts([], [], { ...defaultStoreFilters, price: "free" }, 7, 3), {
    features: 0, "pilotage-tools": 0, all: 0,
  });
});

test("les scores restent explicables et bornés", () => {
  assert.deepEqual(nafCodes("Restaurant 56.10A et 56.10a"), ["56.10A"]);
  assert.deepEqual(nafCodes("coiffure", [{ activite_principale: "96.02A" }, { activite_principale: "96.02A" }]), ["96.02A"]);
  assert.equal(scoreProspect({ siret: "12345678901234", address: "Paris", activity: "56.10A", latitude: null, longitude: null }).score, 75);
  const score = customerHealthScore({ last_order_at: "2026-11-01T00:00:00.000Z", orders_90d: 4, points: 500 }, Date.parse("2026-11-10T00:00:00.000Z"));
  assert.deepEqual(score, { total: 100, recency: 50, frequency: 35, loyalty: 15 });
});

test("CRM et scanner : abonnement et installation requis, données isolées par établissement", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const app = async (restaurant: string, query: string, params: unknown[] = []) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id',$1,true),set_config('app.public','false',true)", [restaurant]);
      return tx.query(query, params);
    });
    const allowed = async (addon: string) => (await app("bernay", "SELECT app.addon_installed('bernay',$1) AS allowed", [addon])).rows[0] as { allowed: boolean };
    assert.equal((await allowed("pipeline-crm")).allowed, false);
    assert.equal((await allowed("prospect-scanner")).allowed, false);
    assert.equal((await allowed("customer-health")).allowed, false);
    await assert.rejects(app("bernay", "INSERT INTO crm_companies(id,restaurant_id,name) VALUES('test-company','bernay','Client test')"));
    for (const addon of ["pipeline-crm", "prospect-scanner", "customer-health"]) {
      await db.query("INSERT INTO addon_subscriptions(id,restaurant_id,addon,stripe_session) VALUES($1,'bernay',$2,$3)", [`test-${addon}`, addon, `cs_test_${addon}`]);
      await db.query("SELECT app.addon_reconcile($1,$2,$3,'active',now()+interval '1 month')", [`test-${addon}`, `cs_test_${addon}`, `sub_test_${addon}`]);
      assert.equal((await allowed(addon)).allowed, true);
    }
    await app("bernay", "INSERT INTO crm_companies(id,restaurant_id,name) VALUES('test-company','bernay','Client test')");
    await app("bernay", "INSERT INTO crm_contacts(id,restaurant_id,company_id,name) VALUES('test-contact','bernay','test-company','Contact test')");
    await app("bernay", "INSERT INTO crm_opportunities(id,restaurant_id,company_id,title) VALUES('test-deal','bernay','test-company','Vente test')");
    await app("bernay", "INSERT INTO prospect_scans(id,restaurant_id,city,sector,radius_km) VALUES('test-scan','bernay','Paris','56.10A',10)");
    assert.equal((await app("bernay", "SELECT id FROM crm_companies WHERE id='test-company'")).rows.length, 1);
    assert.equal((await app("atelier", "SELECT id FROM crm_companies WHERE id='test-company'")).rows.length, 0);
    assert.equal((await app("atelier", "SELECT id FROM crm_contacts WHERE id='test-contact'")).rows.length, 0);
    assert.equal((await app("atelier", "SELECT id FROM prospect_scans WHERE id='test-scan'")).rows.length, 0);
    await assert.rejects(app("bernay", "INSERT INTO crm_opportunities(id,restaurant_id,company_id,title) VALUES('foreign','bernay','other-company','Interdit')"));
    await app("bernay", "SELECT app.addon_installation_set('bernay','pipeline-crm',false)");
    assert.equal((await allowed("pipeline-crm")).allowed, false);
    assert.equal((await app("bernay", "SELECT id FROM crm_companies WHERE id='test-company'")).rows.length, 0);
  } finally {
    await db.close();
  }
});
