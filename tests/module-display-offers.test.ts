import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { workspaceNavigation } from "../src/features/navigation/catalog";
import { restaurantOnlyNavigation } from "../src/features/onboarding/catalog";
import { dashboardEntries, displayModuleForAddon, displayableModules } from "../src/features/modules/display";
import { productInput, serviceInput, availabilitySummary } from "../src/features/offers/model";

const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);
const all = workspaceNavigation.resolve({ roles: "OWNER", plan: 39 });

test("dashboard display: hiding removes the entry, showing lifts only the sector filter", () => {
  // Restauration : tout est affiché par défaut ; « masquer » retire l'écran du tableau de bord.
  assert.ok(ids(dashboardEntries(all, "restaurant", restaurantOnlyNavigation)).includes("dining"));
  assert.ok(!ids(dashboardEntries(all, "restaurant", restaurantOnlyNavigation, [{ module_id: "floor", shown: false }])).includes("dining"));
  // Autre métier : les modules de restauration sont masqués, sauf ceux que le commerce affiche.
  const beauty = ids(dashboardEntries(all, "beauty", restaurantOnlyNavigation));
  assert.ok(!beauty.includes("dining") && !beauty.includes("kitchen"));
  assert.ok(beauty.includes("services") && beauty.includes("products"));
  const shown = ids(dashboardEntries(all, "beauty", restaurantOnlyNavigation, [{ module_id: "floor", shown: true }]));
  assert.ok(shown.includes("dining") && !shown.includes("kitchen"));
  // Les deux écrans d'un même module suivent le même choix.
  const hr = ids(dashboardEntries(all, "beauty", restaurantOnlyNavigation, [{ module_id: "attendance", shown: false }]));
  assert.ok(!hr.includes("attendance") && !hr.includes("hr"));
  // La configuration et les add-ons ne sont jamais réglables.
  assert.ok(!(displayableModules as readonly string[]).includes("settings"));
  assert.equal(displayModuleForAddon("booking"), "table-booking");
  assert.equal(displayModuleForAddon("any-tool", "business"), "trade-tools");
  assert.equal(displayModuleForAddon("snow-loader"), null);
});

test("offer inputs validate prices, delivery delays, stock links and availability slots", () => {
  const product = {
    name: "Bougie", category: "", sku: "", summary: "", description: "", priceCents: 1500, compareAtCents: null,
    vatRate: 20, images: [], deliveryModes: ["pickup"], deliveryMinDays: 1, deliveryMaxDays: 3, shippingFeeCents: 0,
    weightGrams: null, stockMode: "none", stockQuantity: 0, stockThreshold: 0, stockIngredientId: null, published: true, featured: false,
  };
  assert.ok(productInput.safeParse(product).success);
  assert.ok(!productInput.safeParse({ ...product, deliveryMinDays: 5 }).success, "max before min");
  assert.ok(!productInput.safeParse({ ...product, stockMode: "linked" }).success, "linked without article");
  assert.ok(!productInput.safeParse({ ...product, compareAtCents: 1000 }).success, "compare-at below price");
  assert.ok(!productInput.safeParse({ ...product, vatRate: 7 }).success, "unknown VAT");
  assert.ok(!productInput.safeParse({ ...product, images: ["https://evil.example/x.png"] }).success, "foreign image");
  const service = {
    name: "Coupe", category: "", summary: "", description: "", durationMinutes: 45, bufferMinutes: 0, priceCents: 3500,
    priceFrom: false, vatRate: 20, capacity: 1, location: "on_site", availability: [{ day: 1, start: "09:00", end: "12:00" }],
    noticeHours: 0, images: [], published: false,
  };
  assert.ok(serviceInput.safeParse(service).success);
  assert.ok(!serviceInput.safeParse({ ...service, availability: [{ day: 1, start: "12:00", end: "09:00" }] }).success);
  assert.deepEqual(availabilitySummary([{ day: 0, start: "10:00", end: "12:00" }, { day: 1, start: "09:00", end: "12:00" }]),
    ["Lundi 09 h 00–12 h 00", "Dimanche 10 h 00–12 h 00"]);
});

async function database() {
  const db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  return db;
}
/** Requête exécutée avec le rôle applicatif, comme un membre connecté (ou le canal public). */
function as(db: PGlite, user: string, restaurant: string, publicChannel = false) {
  return async <T>(sql: string, params: unknown[] = []) => db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE atacuisine_app");
    await tx.query("SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true)",
      [publicChannel ? "" : user, restaurant, String(publicChannel)]);
    return (await tx.query<T>(sql, params)).rows;
  });
}

test("module_display: only the establishment super admin sets it; showing opens the floor plan out of sector", async () => {
  const db = await database();
  try {
    await db.exec("UPDATE restaurants SET industry='beauty' WHERE id='atelier'");
    const owner = as(db, "nadia", "atelier");
    const available = async (module: string) =>
      (await owner<{ ok: boolean }>("SELECT app.module_available('atelier',$1) AS ok", [module]))[0].ok;
    assert.equal(await available("floor"), false);
    assert.equal(await available("services"), true);
    assert.equal(await available("products"), true);

    await owner("SELECT app.module_display_set('atelier','floor',true)");
    assert.equal(await available("floor"), true);
    assert.equal(await available("kitchen"), false, "only the chosen module is opened");
    assert.equal((await owner<{ ok: boolean }>("SELECT app.module_enabled('atelier','floor') AS ok"))[0].ok, true);

    // Masquer ne retire aucun droit : c'est un choix de présentation.
    await owner("SELECT app.module_display_set('atelier','floor',false)");
    assert.equal(await available("floor"), false, "hidden out of sector falls back to the default");
    await owner("SELECT app.module_display_set('atelier','website',false)");
    assert.equal(await available("website"), true);
    assert.deepEqual(
      (await owner<{ module_id: string; shown: boolean }>("SELECT module_id,shown FROM module_display ORDER BY module_id")),
      [{ module_id: "floor", shown: false }, { module_id: "website", shown: false }],
    );
    await owner("SELECT app.module_display_set('atelier','website',NULL)");
    assert.equal((await owner("SELECT 1 FROM module_display WHERE module_id='website'")).length, 0);

    await assert.rejects(owner("SELECT app.module_display_set('atelier','settings',false)"), /ne se règle pas/);
    await assert.rejects(as(db, "lina", "bernay")("SELECT app.module_display_set('bernay','floor',false)"), /super admin/);
    await assert.rejects(as(db, "nadia", "bernay", true)("SELECT app.module_display_set('bernay','floor',false)"), /super admin/);
  } finally {
    await db.close();
  }
});

test("services and products: isolated per establishment, public channel sees only published items", async () => {
  const db = await database();
  try {
    const bernay = as(db, "nadia", "bernay");
    await bernay(`INSERT INTO business_products(id,restaurant_id,name,price_cents,published,stock_mode,stock_quantity,stock_threshold)
      VALUES('11111111-1111-1111-1111-111111111111','bernay','Publié',1200,true,'own',2,5),
            ('22222222-2222-2222-2222-222222222222','bernay','Brouillon',900,false,'none',0,0)`);
    await bernay(`INSERT INTO business_services(id,restaurant_id,name,duration_minutes,price_cents,published)
      VALUES('33333333-3333-3333-3333-333333333333','bernay','Atelier',60,4000,true)`);
    // Un autre établissement ne voit ni n'écrit rien.
    assert.equal((await as(db, "nadia", "atelier")("SELECT id FROM business_products")).length, 0);
    await assert.rejects(as(db, "nadia", "atelier")(
      "INSERT INTO business_products(id,restaurant_id,name,price_cents) VALUES('44444444-4444-4444-4444-444444444444','bernay','Intrus',1)"));
    // Le canal public ne lit pas les tables, seulement la sélection publiée.
    const visitor = as(db, "", "bernay", true);
    assert.equal((await visitor("SELECT id FROM business_products")).length, 0);
    const [{ data }] = await visitor<{ data: { products: { name: string; availability: string }[]; services: { name: string }[] } }>(
      "SELECT app.public_offers('bernay') AS data");
    assert.deepEqual(data.products.map((p) => [p.name, p.availability]), [["Publié", "low"]]);
    assert.deepEqual(data.services.map((s) => s.name), ["Atelier"]);
    assert.equal((await as(db, "", "atelier", true)<{ data: unknown }>("SELECT app.public_offers('bernay') AS data"))[0].data, null);
    // Un article de stock relié appartient au même établissement.
    await db.exec("INSERT INTO ingredients(id,restaurant_id,name,unit,threshold,cost) VALUES('foreign-stock','atelier','Autre','unit',0,0)");
    await assert.rejects(bernay(
      "UPDATE business_products SET stock_mode='linked',stock_ingredient_id='foreign-stock' WHERE id='11111111-1111-1111-1111-111111111111'"),
      /Article de stock inconnu/);
  } finally {
    await db.close();
  }
});
