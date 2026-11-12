import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { allergenList, tradeCategories, tradeTools, type TradeTool } from "../src/features/trade/definitions";
import {
  builtinSegment,
  formatAllergens,
  matchesCustomSegment,
  overlaps,
  parseAllergens,
  parseTradeData,
  quoteTotals,
  shippingQuote,
} from "../src/features/trade/model";
import { parisTime, tradePerformOn, tradePilotage, tradeStateOn, type Scoped } from "../src/features/trade/service";

async function database() {
  const db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  return db;
}
async function as(db: PGlite, user: string, restaurant: string) {
  await db.exec("RESET ROLE");
  await db.query(
    "SELECT set_config('app.user_id',$1,false),set_config('app.restaurant_id',$2,false),set_config('app.public','false',false)",
    [user, restaurant],
  );
  await db.exec("SET ROLE atacuisine_app");
}
const owner: Scoped = { id: "nadia", name: "Nadia", role: "OWNER", roles: ["OWNER"] };
const waiter: Scoped = { id: "sarah", name: "Sarah", role: "WAITER", roles: ["WAITER"] };
async function install(db: PGlite, restaurant: string, ...tools: string[]) {
  await as(db, "nadia", restaurant);
  for (const tool of tools) await db.query("SELECT app.addon_install_free($1,$2)", [restaurant, tool]);
}
type State = Awaited<ReturnType<typeof tradeStateOn>>;
const kpi = (state: State, label: string) => {
  for (const panel of state.panels)
    if (panel.type === "kpis") {
      const item = panel.items.find((entry) => entry.label === label);
      if (item) return item.value;
    }
  throw new Error(`Indicateur absent : ${label}`);
};
const table = (state: State, title: string) => {
  const panel = state.panels.find((entry) => entry.type === "table" && entry.title === title);
  if (!panel || panel.type !== "table") throw new Error(`Tableau absent : ${title}`);
  return panel.rows;
};
const create = (db: PGlite, restaurant: string, tool: string, entity: string, data: unknown, user = owner) =>
  tradePerformOn(db, restaurant, user, tool, { action: "create", entity, data });

test("catalogue : vingt outils métier gratuits, cinq catégories, définitions cohérentes", async () => {
  const db = await database();
  try {
    const { rows } = await db.query<{ id: string; category_id: string; pricing_mode: string; listed: boolean; sellable: boolean }>(
      "SELECT id,category_id,pricing_mode,listed,sellable FROM addon_products WHERE kind='business' ORDER BY position",
    );
    assert.equal(rows.length, 20);
    assert.deepEqual(rows.map((row) => row.id), tradeTools.map((tool) => tool.id));
    for (const row of rows) {
      const tool = tradeTools.find((entry) => entry.id === row.id)!;
      assert.equal(row.category_id, tool.category);
      assert.ok(row.listed && row.sellable && row.pricing_mode === "free");
    }
    const categories = await db.query<{ id: string }>("SELECT id FROM addon_categories WHERE id LIKE 'metier-%' ORDER BY position");
    assert.deepEqual(categories.rows.map((row) => row.id), Object.values(tradeCategories).map((category) => category.id));
    for (const tool of tradeTools as readonly TradeTool[]) {
      assert.ok(tool.features.length >= 3, `${tool.id} doit présenter ses fonctionnalités`);
      for (const entity of tool.entities) {
        assert.ok(entity.fields.some((field) => field.key === entity.title), `${tool.id}.${entity.id} : titre inconnu`);
        for (const field of entity.fields)
          if (field.type === "ref") assert.ok(tool.entities.some((other) => other.id === field.ref), `${tool.id}.${field.key} : référence inconnue`);
      }
      if (tool.requires) assert.ok(tradeTools.some((other) => other.id === tool.requires));
    }
  } finally {
    await db.close();
  }
});

test("installation : sans outil installé, aucune fiche n’est lisible ni écrite, même en SQL direct", async () => {
  const db = await database();
  try {
    await as(db, "nadia", "bernay");
    await assert.rejects(tradeStateOn(db, "bernay", owner, "site-planning"), /pas installé/);
    await assert.rejects(
      db.query("INSERT INTO trade_records(restaurant_id,tool_id,entity,data) VALUES('bernay','site-planning','site','{}')"),
      /row-level security/,
    );
    await assert.rejects(tradeStateOn(db, "bernay", owner, "inconnu"), /Outil inconnu/);
    await as(db, "sarah", "bernay");
    await assert.rejects(db.query("SELECT app.addon_install_free('bernay','site-planning')"));

    await install(db, "bernay", "site-planning");
    const site = await create(db, "bernay", "site-planning", "site", { name: "Maison Durand", client: "M. Durand", status: "En cours", end: "2030-01-31" });
    const siteId = site.records.find((record) => record.entity === "site")!.id;
    await assert.rejects(create(db, "bernay", "site-planning", "task", { site: "00000000-0000-4000-8000-000000000000", title: "Gros œuvre", start: "2026-01-01", end: "2026-01-10", status: "En cours" }), /aucune fiche/);
    await assert.rejects(create(db, "bernay", "site-planning", "task", { site: siteId, title: "X", start: "2026-01-01", end: "2026-01-10", status: "Inventé" }), /invalide/);
    await assert.rejects(create(db, "bernay", "site-planning", "site", { name: "A", status: "En cours", pirate: true }), /Champ inconnu/);
    await assert.rejects(create(db, "bernay", "site-planning", "site", { status: "En cours" }), /obligatoire/);
    const state = await create(db, "bernay", "site-planning", "task", { site: siteId, title: "Gros œuvre", start: "2020-01-01", end: "2020-01-10", status: "En cours" });
    assert.equal(kpi(state, "Étapes en retard"), "1");
    assert.equal(kpi(state, "Chantiers en cours"), "1");
    const timeline = state.panels.find((panel) => panel.type === "timeline");
    assert.ok(timeline && timeline.type === "timeline" && timeline.items[0].group === "Maison Durand" && timeline.items[0].tone === "bad");

    // Un employé sans permission particulière utilise l’outil de chantier.
    await as(db, "sarah", "bernay");
    assert.equal((await tradeStateOn(db, "bernay", waiter, "site-planning")).records.length, 2);
    await assert.rejects(db.query("UPDATE trade_records SET restaurant_id='atelier'"), /non modifiable|row-level/);

    // Désinstaller coupe l’accès sans effacer les fiches.
    await as(db, "nadia", "bernay");
    await db.query("SELECT app.addon_installation_set('bernay','site-planning',false)");
    await assert.rejects(tradeStateOn(db, "bernay", owner, "site-planning"), /pas installé/);
    assert.equal((await db.query("SELECT * FROM trade_records")).rows.length, 0);
    await db.query("SELECT app.addon_installation_set('bernay','site-planning',true)");
    assert.equal((await tradeStateOn(db, "bernay", owner, "site-planning")).records.length, 2);
  } finally {
    await db.close();
  }
});

test("isolation : un établissement ne voit jamais les fiches d’un autre, ni le site public", async () => {
  const db = await database();
  try {
    await install(db, "bernay", "client-style");
    await create(db, "bernay", "client-style", "sheet", { client: "Camille", formula: "6.1 + 20 vol" });
    await install(db, "atelier", "client-style");
    await as(db, "nadia", "atelier");
    assert.equal((await tradeStateOn(db, "atelier", owner, "client-style")).records.length, 0);
    assert.equal((await db.query("SELECT * FROM trade_records")).rows.length, 0);
    const bernayId = await (async () => {
      await db.exec("RESET ROLE");
      return (await db.query<{ id: string }>("SELECT id FROM trade_records")).rows[0].id;
    })();
    await as(db, "nadia", "atelier");
    await assert.rejects(tradePerformOn(db, "atelier", owner, "client-style", { action: "archive", id: bernayId }), /introuvable/);
    await assert.rejects(create(db, "atelier", "client-style", "visit", { sheet: bernayId, date: "2026-01-01", service: "Coupe" }), /aucune fiche/);
    await as(db, "sarah", "atelier");
    await assert.rejects(tradeStateOn(db, "atelier", waiter, "client-style"));
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('app.public','true',false),set_config('app.restaurant_id','bernay',false),set_config('app.user_id','',false)");
    await db.exec("SET ROLE atacuisine_app");
    assert.equal((await db.query("SELECT * FROM trade_records")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("permissions : chaque outil suit la permission de son métier", async () => {
  const db = await database();
  try {
    await install(db, "bernay", "recipe-cost", "customer-segments", "kitchen-display");
    await as(db, "sarah", "bernay");
    await assert.rejects(tradeStateOn(db, "bernay", waiter, "recipe-cost"), /refusé/);
    await assert.rejects(tradeStateOn(db, "bernay", waiter, "customer-segments"), /refusé/);
    const chef: Scoped = { id: "karim", name: "Karim", role: "CHEF", roles: ["CHEF"] };
    await as(db, "karim", "bernay");
    assert.ok(await tradeStateOn(db, "bernay", chef, "kitchen-display"));
    await assert.rejects(tradeStateOn(db, "bernay", chef, "recipe-cost"), /refusé/);
  } finally {
    await db.close();
  }
});

test("restauration : coûts matière, allergènes publiés sur la carte, écran cuisine et pertes", async () => {
  const db = await database();
  try {
    await install(db, "bernay", "recipe-cost", "menu-allergens", "kitchen-display", "service-pacing", "waste-tracker");
    const costs = await tradeStateOn(db, "bernay", owner, "recipe-cost");
    const rows = table(costs, "Coût matière par produit");
    assert.ok(rows.length > 0, "la carte de démonstration a des recettes chiffrées");
    assert.match(rows[0][3], /%/);

    const allergens = await tradeStateOn(db, "bernay", owner, "menu-allergens");
    const item = (allergens.extra as { items: { id: string; name: string }[] }).items[0];
    await tradePerformOn(db, "bernay", owner, "menu-allergens", { action: "allergens", menuId: item.id, present: ["Gluten", "Lait", "Inventé"], traces: ["Lait", "Sésame"] });
    const stored = await db.query<{ allergens: string }>("SELECT allergens FROM menu_items WHERE id=$1", [item.id]);
    assert.equal(stored.rows[0].allergens, "Contient : Gluten, Lait. Traces possibles : Sésame.");
    await assert.rejects(tradePerformOn(db, "atelier", owner, "menu-allergens", { action: "allergens", menuId: item.id, present: [], traces: [] }));

    const open = await db.query<{ count: number }>(
      "SELECT count(DISTINCT o.id)::int AS count FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.restaurant_id='bernay' AND o.status IN ('pending','active') AND i.status IN ('waiting','preparing','ready') AND i.station='kitchen'",
    );
    const kitchen = await tradeStateOn(db, "bernay", owner, "kitchen-display");
    assert.equal((kitchen.extra as { tickets: unknown[] }).tickets.length, open.rows[0].count);
    const pacing = await tradeStateOn(db, "bernay", owner, "service-pacing");
    assert.ok(pacing.panels.some((panel) => panel.type === "bars" && panel.title === "Préparations en attente par poste"));

    const ingredient = (await db.query<{ id: string; cost: number }>("SELECT id,cost::float AS cost FROM ingredients WHERE restaurant_id='bernay' AND cost>0 LIMIT 1")).rows[0];
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    await assert.rejects(create(db, "bernay", "waste-tracker", "waste", { ingredient: "inconnu", quantity: 1, reason: "Casse", date: today }), /choix inconnu/);
    const waste = await create(db, "bernay", "waste-tracker", "waste", { ingredient: ingredient.id, quantity: 10, reason: "Péremption", date: today });
    assert.equal(kpi(waste, "Cause principale"), "Péremption");
    assert.equal(kpi(waste, "Coût des pertes ce mois").replace(/\s/g, " "), new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Math.round(10 * ingredient.cost * 100) / 100).replace(/\s/g, " "));
  } finally {
    await db.close();
  }
});

test("BTP et coiffure : devis chiffrés, matériel à entretenir, agenda sans chevauchement, stock et occupation", async () => {
  const db = await database();
  try {
    await install(db, "bernay", "quote-builder", "equipment-log", "appointment-booking", "salon-stock", "chair-occupancy");
    const quote = await create(db, "bernay", "quote-builder", "quote", {
      number: "D-001", title: "Salle de bain", client: "Mme Martin", status: "Envoyé",
      lines: [{ label: "Carrelage", quantity: 12.5, unit: "m²", unitPrice: 4500, vat: 10 }, { label: "Main d’œuvre", quantity: 8, unit: "h", unitPrice: 5000, vat: 20 }],
    });
    assert.deepEqual((quote.extra as { totals: Record<string, unknown> }).totals[quote.records[0].id], { net: 96250, vat: 13625, gross: 109875 });
    await assert.rejects(create(db, "bernay", "quote-builder", "quote", { number: "D-2", title: "T", client: "C", status: "Envoyé", lines: [{ label: "X", quantity: 1, unit: "u", unitPrice: 100, vat: 7 }] }), /invalide/);

    const soon = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("sv-SE");
    const equipment = await create(db, "bernay", "equipment-log", "equipment", { name: "Mini-pelle", status: "Affecté", nextService: soon });
    assert.equal(kpi(equipment, "Entretien sous 14 jours"), "1");

    const service = await create(db, "bernay", "appointment-booking", "service", { name: "Coupe brushing", duration: 45, price: 3500 });
    const serviceId = service.records[0].id;
    const start = new Date(parisTime(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }), 10));
    await create(db, "bernay", "appointment-booking", "appointment", { client: "Léa", service: serviceId, staff: "Nadia", start: start.toISOString(), status: "Confirmé" });
    const agenda = await create(db, "bernay", "appointment-booking", "appointment", { client: "Inès", service: serviceId, staff: "Nadia", start: new Date(start.getTime() + 30 * 60_000).toISOString(), status: "Confirmé" });
    assert.equal(kpi(agenda, "Chevauchements"), "2");
    assert.equal(kpi(agenda, "Rendez-vous aujourd’hui"), "2");
    await assert.rejects(create(db, "bernay", "appointment-booking", "appointment", { client: "X", service: serviceId, staff: "Inconnu", start: start.toISOString(), status: "Confirmé" }), /choix inconnu/);

    const occupancy = await tradePerformOn(db, "bernay", owner, "chair-occupancy", { action: "create", entity: "settings", data: { chairs: 1, open: 9, close: 12 } });
    const bars = occupancy.panels.find((panel) => panel.type === "bars" && panel.title.startsWith("Charge"));
    assert.ok(bars && bars.type === "bars");
    assert.deepEqual(bars.items.map((entry) => Math.round(entry.value)), [0, 100, 25]);
    await assert.rejects(tradePerformOn(db, "bernay", owner, "chair-occupancy", { action: "create", entity: "settings", data: { chairs: 2, open: 9, close: 12 } }), /existent déjà/);

    const product = await create(db, "bernay", "salon-stock", "product", { name: "Coloration 6.1", usage: "Technique", initial: 5, threshold: 3, cost: 800 });
    const stock = await create(db, "bernay", "salon-stock", "movement", { product: product.records[0].id, type: "Utilisation", quantity: 3, date: "2026-01-02" });
    assert.equal(kpi(stock, "Sous le seuil"), "1");
  } finally {
    await db.close();
  }
});

test("commerce et tous métiers : livraison, lots, paniers abandonnés, segments, campagnes, conversion", async () => {
  const db = await database();
  try {
    await install(db, "bernay", "shipping-rules", "product-bundles", "abandoned-cart", "customer-segments", "loyalty-campaigns", "conversion-insights", "product-variants");
    await create(db, "bernay", "shipping-rules", "zone", { name: "Paris", postcodes: "75", mode: "Livraison", fee: 590, freeAbove: 5000, delay: 1 });
    const zones = await create(db, "bernay", "shipping-rules", "zone", { name: "Petite couronne", postcodes: "92, 93, 75", mode: "Coursier", fee: 890 });
    assert.equal(kpi(zones, "Conflits de zones"), "1");

    const menu = (await db.query<{ id: string; price: number }>("SELECT id,price FROM menu_items WHERE restaurant_id='bernay' AND archived_at IS NULL ORDER BY id LIMIT 2")).rows;
    const bundle = await create(db, "bernay", "product-bundles", "bundle", { name: "Formule", items: menu.map((item) => item.id), price: Math.round((menu[0].price + menu[1].price) * 0.8), status: "Actif" });
    assert.equal(table(bundle, "Composition et rentabilité")[0][4].replace(/\s/g, " "), "20 %");
    await assert.rejects(create(db, "bernay", "product-variants", "variant", { product: "inconnu", option: "Taille", value: "M", stock: 2 }), /choix inconnu/);

    const carts = await tradeStateOn(db, "bernay", owner, "abandoned-cart");
    assert.ok(carts.panels.some((panel) => panel.type === "table" && panel.title === "Commandes à relancer"));

    await db.exec("RESET ROLE");
    await db.query("INSERT INTO customers(id,restaurant_id,name,contact,points) VALUES('vip','bernay','Client fidèle','vip@example.test',500)");
    await as(db, "nadia", "bernay");
    const segments = await create(db, "bernay", "customer-segments", "segment", { name: "Gros points", minPoints: 400 });
    assert.deepEqual((segments.extra as { members: Record<string, { name: string }[]> }).members["Gros points"].map((entry) => entry.name), ["Client fidèle"]);
    const campaign = await create(db, "bernay", "loyalty-campaigns", "campaign", { name: "Merci", segment: "Gros points", offer: "Cadeau", channel: "Email", start: "2000-01-01", end: "2999-12-31" });
    assert.equal(table(campaign, "Calendrier des campagnes")[0][5], "1 clients");
    await assert.rejects(create(db, "bernay", "loyalty-campaigns", "campaign", { name: "X", segment: "Inventé", offer: "Cadeau", channel: "Email", start: "2000-01-01", end: "2000-01-02" }), /choix inconnu/);

    const conversion = await tradeStateOn(db, "bernay", owner, "conversion-insights");
    assert.ok(conversion.panels.some((panel) => panel.type === "bars" && panel.title === "Entonnoir sur 30 jours"));
  } finally {
    await db.close();
  }
});

test("règles de calcul : validation, devis, chevauchements, livraison, segments, allergènes", () => {
  const entity = tradeTools.find((tool) => tool.id === "salon-stock")!.entities[0];
  assert.deepEqual(parseTradeData(entity, { name: "  Shampoing ", usage: "Revente", initial: 4, threshold: 1, brand: "" }), { name: "Shampoing", usage: "Revente", initial: 4, threshold: 1 });
  assert.throws(() => parseTradeData(entity, { name: "A", usage: "Revente", initial: -1, threshold: 1 }), /invalide/);
  assert.throws(() => parseTradeData(entity, { name: "A\u0007", usage: "Revente", initial: 1, threshold: 1 }), /invalide/);
  assert.throws(() => parseTradeData(entity, []), /invalide/);
  assert.throws(() => parseTradeData(entity, { name: "A", usage: "Revente", initial: 1, threshold: 1, cost: 1.5 }), /invalide/, "centimes entiers");
  assert.deepEqual(quoteTotals([{ label: "A", quantity: 3, unit: "u", unitPrice: 1000, vat: 5.5 }]), { net: 3000, vat: 165, gross: 3165 });
  const t = Date.parse("2026-01-01T10:00:00Z");
  assert.equal(overlaps(t, 30, t + 29 * 60_000, 30), true);
  assert.equal(overlaps(t, 30, t + 30 * 60_000, 30), false);
  const zones = [{ name: "Paris", postcodes: "75, 77", fee: 500, freeAbove: 3000, delay: 1, mode: "Livraison" }];
  assert.deepEqual(shippingQuote(zones, "75 011", 1000), { zone: "Paris", mode: "Livraison", fee: 500, delay: 1, free: false });
  assert.equal(shippingQuote(zones, "75011", 3000)?.fee, 0);
  assert.equal(shippingQuote(zones, "13001", 1000), null);
  const now = Date.parse("2026-06-01T00:00:00Z");
  const base = { id: "c", name: "C", contact: "", points: 0, spend: 0, orders: 1, lastOrder: "2026-05-25T00:00:00Z", firstOrder: "2026-05-25T00:00:00Z" };
  assert.equal(builtinSegment(base, now), "Nouveaux");
  assert.equal(builtinSegment({ ...base, orders: 4, firstOrder: "2025-01-01T00:00:00Z" }, now), "Fidèles");
  assert.equal(builtinSegment({ ...base, lastOrder: "2026-03-01T00:00:00Z" }, now), "À risque");
  assert.equal(builtinSegment({ ...base, lastOrder: "2025-01-01T00:00:00Z" }, now), "Inactifs");
  assert.equal(builtinSegment({ ...base, orders: 0, lastOrder: null }, now), "Sans commande");
  assert.equal(matchesCustomSegment({ ...base, orders: 5, spend: 9000 }, { minOrders: 5, minSpend: 8000 }, now), true);
  assert.equal(matchesCustomSegment({ ...base, lastOrder: "2026-05-30T00:00:00Z" }, { inactiveDays: 30 }, now), false);
  const text = formatAllergens(["Gluten", "Œufs"], ["Fruits à coque"]);
  assert.deepEqual(parseAllergens(text, allergenList), { present: ["Gluten", "Œufs"], traces: ["Fruits à coque"] });
  assert.equal(formatAllergens([], []), "Aucun des 14 allergènes réglementaires.");
  assert.equal(new Date(parisTime("2026-01-15", 10)).toISOString(), "2026-01-15T09:00:00.000Z", "hiver : UTC+1");
  assert.equal(new Date(parisTime("2026-07-15", 10)).toISOString(), "2026-07-15T08:00:00.000Z", "été : UTC+2");
});

test("migration descendante : outils métier et fiches retirés, boutique intacte", async () => {
  const db = await database();
  try {
    await install(db, "bernay", "site-planning");
    await db.exec("RESET ROLE");
    await db.exec(await readFile("database/migrations/down/077_trade_tools.sql", "utf8"));
    assert.equal((await db.query("SELECT to_regclass('public.trade_records') AS t")).rows[0] && (await db.query<{ t: string | null }>("SELECT to_regclass('public.trade_records') AS t")).rows[0].t, null);
    assert.equal((await db.query("SELECT * FROM addon_products WHERE kind='business'")).rows.length, 0);
    assert.ok((await db.query("SELECT * FROM addon_products WHERE kind='loading_screen'")).rows.length >= 10);
  } finally {
    await db.close();
  }
});

test("vue d’ensemble : chaque outil métier installé alimente ses blocs, les autres restent absents", async () => {
  const db = await database();
  try {
    await as(db, "nadia", "bernay");
    assert.deepEqual(await tradePilotage(db, "bernay", owner), {});
    await install(db, "bernay", "site-planning", "quote-builder", "equipment-log");
    await create(db, "bernay", "site-planning", "site", { name: "Maison Durand", status: "En cours", start: "2020-01-01", end: "2099-01-31" });
    await create(db, "bernay", "site-planning", "site", { name: "Ancien", status: "Terminé", start: "2020-01-01", end: "2099-01-31" });
    await create(db, "bernay", "quote-builder", "quote", { number: "D-1", title: "Toiture", client: "M. Durand", status: "Envoyé", lines: [{ label: "Tuiles", quantity: 1, unit: "u", unitPrice: 1000, vat: 20 }] });
    await create(db, "bernay", "equipment-log", "equipment", { name: "Bétonnière", kind: "Engin", status: "Disponible", nextService: "2020-01-01" });
    const summary = await tradePilotage(db, "bernay", owner);
    assert.deepEqual(summary.sites, { active: 1 });
    assert.deepEqual(summary.quotes, { pending: 1 });
    assert.deepEqual(summary.equipment, { due: 1 });
    assert.equal(summary.agenda, undefined);
    // Un profil sans la permission d’un outil ne voit pas son bloc.
    assert.equal((await tradePilotage(db, "bernay", waiter)).quotes, undefined);
  } finally {
    await db.close();
  }
});
