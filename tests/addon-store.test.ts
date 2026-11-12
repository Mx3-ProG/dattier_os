import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import {
  derivePurchaseOutcome,
  reconcilePurchaseOn,
  type PurchaseFacts,
  type PurchaseGateway,
} from "../src/features/addons/purchases";
import { readLoadingScreen } from "../src/features/addons/store-service";
import {
  defaultStoreFilters,
  categoryCounts,
  featuresVisible,
  filterProducts,
  formatPrice,
  installedAddonCount,
  productAction,
  type StoreLicense,
  type StoreProduct,
} from "../src/features/addons/store-catalog";
import {
  loadingRendererIds,
  loadingRenderers,
  loadingSettingsSchema,
  parseLoadingCache,
  resolveLoadingConfig,
  restaurantFromLocation,
  safeLogo,
} from "../src/features/addons/loading-screens";
import { isThemedVisual, themedVisualIds, themedPrice } from "../src/features/cms/themed-visuals";

async function database() {
  const db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  return db;
}
/** Se comporte comme une requête applicative : rôle sans privilège et contexte d’établissement. */
async function as(db: PGlite, user: string, restaurant: string) {
  await db.exec("RESET ROLE");
  await db.query(
    "SELECT set_config('app.user_id',$1,false),set_config('app.restaurant_id',$2,false),set_config('app.public','false',false)",
    [user, restaurant],
  );
  await db.exec("SET ROLE atacuisine_app");
}
const asBilling = (db: PGlite) => db.exec("RESET ROLE; SET ROLE atacuisine_addon_billing");
const paidFacts = (orderId: string, overrides: Partial<PurchaseFacts> = {}): PurchaseFacts => ({
  livemode: false,
  orderReference: orderId,
  mode: "payment",
  sessionStatus: "complete",
  paymentStatus: "paid",
  amountSubtotal: 500,
  currency: "eur",
  paymentIntent: `pi_${orderId}`,
  chargeAmount: 600,
  amountRefunded: 0,
  disputes: [],
  ...overrides,
});
const gatewayFor = (facts: () => PurchaseFacts): PurchaseGateway => ({
  facts: async () => facts(),
  refund: async () => undefined,
});
type Open = { id: string; amount_cents: number; stripe_session: string | null; stale: boolean };
async function openOrder(db: PGlite, restaurant = "bernay", product = "liquid-flow", session = `cs_${restaurant}`) {
  await as(db, "nadia", restaurant);
  const order = (await db.query<Open>("SELECT * FROM app.addon_purchase_open($1,$2)", [restaurant, product])).rows[0];
  await db.query("SELECT app.addon_purchase_attach($1,$2)", [order.id, session]);
  return order;
}
const license = async (db: PGlite, restaurant: string, product: string) => {
  await db.exec("RESET ROLE");
  return (
    await db.query<{ status: string; purchase_id: string | null; valid_until: string | null }>(
      "SELECT status,purchase_id,valid_until FROM addon_licenses WHERE restaurant_id=$1 AND product_id=$2",
      [restaurant, product],
    )
  ).rows[0];
};
const settingsArgs = (product: string | null, enabled: boolean, revision: number) => [
  "bernay",
  product,
  enabled,
  null,
  null,
  1,
  false,
  null,
  revision,
];
const SAVE = "SELECT app.loading_screen_save($1,$2,$3,$4,$5,$6,$7,$8,$9) AS revision";

test("catalogue : trente-huit écrans aux bons prix TTC", async () => {
  const db = await database();
  try {
    const { rows } = await db.query<{ id: string; pricing_mode: string; price_cents: number; renderer: string; category_id: string }>(
      "SELECT id,pricing_mode,price_cents,renderer,category_id FROM addon_products WHERE kind='loading_screen' ORDER BY position",
    );
    assert.deepEqual(
      rows.slice(0, 14).map((row) => [row.id, row.price_cents]),
      [
        ["magic-loader", 0],
        ["kitchen-loader", 0],
        ["studio-s", 0],
        ["liquid-flow", 500],
        ["neon-pulse", 500],
        ["coffee-break", 500],
        ["orbit-galaxy", 700],
        ["infinity-loop", 700],
        ["crystal-morph", 900],
        ["golden-luxury", 900],
        ["santa-loader", 900],
        ["snowflake-loader", 900],
        ["giftbox-loader", 900],
        ["wreath-loader", 900],
      ],
    );
    assert.deepEqual(rows.slice(14).map((row) => [row.renderer, row.price_cents]), themedVisualIds.map((id) => [id, themedPrice(id)]));
    assert.equal(rows.filter((row) => row.pricing_mode === "free").length, 9);
    assert.ok(rows.every((row) => row.category_id === "loading-screens"));
    assert.deepEqual(rows.map((row) => row.renderer).toSorted(), loadingRendererIds.toSorted());
    await assert.rejects(
      db.query("UPDATE addon_products SET pricing_mode='subscription',price_cents=500 WHERE id='liquid-flow'"),
      /loading_screen_never_subscription/,
    );
  } finally {
    await db.close();
  }
});

test("installation gratuite : réservée aux gestionnaires, idempotente, refusée pour un add-on payant", async () => {
  const db = await database();
  try {
    await as(db, "sarah", "bernay");
    await assert.rejects(db.query("SELECT app.addon_install_free('bernay','magic-loader')"), /refusée/);
    await as(db, "nadia", "bernay");
    await db.query("SELECT app.addon_install_free('bernay','magic-loader')");
    await db.query("SELECT app.addon_install_free('bernay','magic-loader')");
    await assert.rejects(db.query("SELECT app.addon_install_free('bernay','liquid-flow')"), /gratuitement/);
    assert.equal((await license(db, "bernay", "magic-loader")).status, "active");
    const events = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM addon_license_events WHERE product_id='magic-loader'",
    );
    assert.equal(events.rows[0].count, 1);
    await as(db, "sarah", "bernay");
    await assert.rejects(db.query("INSERT INTO addon_licenses(restaurant_id,product_id,source) VALUES('bernay','liquid-flow','free')"));
    await assert.rejects(db.query("UPDATE addon_licenses SET status='active'"));
  } finally {
    await db.close();
  }
});

test("achat : commande unique, licence seulement après vérification Stripe, webhooks dupliqués sans effet", async () => {
  const db = await database();
  try {
    await as(db, "sarah", "bernay");
    await assert.rejects(db.query("SELECT * FROM app.addon_purchase_open('bernay','liquid-flow')"), /refusé/);
    const order = await openOrder(db);
    assert.equal(order.amount_cents, 500);
    assert.equal((await db.query<Open>("SELECT * FROM app.addon_purchase_open('bernay','liquid-flow')")).rows[0].id, order.id);
    await assert.rejects(db.query("SELECT * FROM app.addon_purchase_open('bernay','magic-loader')"), /pas disponible/);
    await db.exec("RESET ROLE");
    assert.equal(await license(db, "bernay", "liquid-flow"), undefined);

    // Le rôle applicatif ne peut pas s’attribuer un droit, même en connaissant la commande.
    await as(db, "nadia", "bernay");
    await assert.rejects(db.query("SELECT app.addon_purchase_apply($1,'cs_bernay','pi','paid',0)", [order.id]), /permission denied/);
    await assert.rejects(db.query("UPDATE addon_purchases SET status='paid'"));

    await asBilling(db);
    let facts = paidFacts(order.id, { paymentStatus: "unpaid" });
    const gateway = gatewayFor(() => facts);
    await reconcilePurchaseOn(db, gateway, order.id);
    assert.equal(await license(db, "bernay", "liquid-flow"), undefined, "paiement différé non encore réglé");

    facts = paidFacts(order.id);
    await asBilling(db);
    for (let attempt = 0; attempt < 3; attempt++) {
      assert.equal((await reconcilePurchaseOn(db, gateway, order.id)).status, "paid");
    }
    const owned = await license(db, "bernay", "liquid-flow");
    assert.equal(owned.status, "active");
    assert.equal(owned.purchase_id, order.id);
    assert.equal(owned.valid_until, null, "licence sans date d’expiration");
    const events = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM addon_license_events WHERE purchase_id=$1", [order.id]);
    assert.equal(events.rows[0].count, 1, "trois notifications, une seule attribution");

    await as(db, "nadia", "bernay");
    await assert.rejects(db.query("SELECT * FROM app.addon_purchase_open('bernay','liquid-flow')"), /déjà acquis/);
    // Une expiration tardive ne retire pas un achat confirmé.
    await asBilling(db);
    assert.equal(await db.query<{ s: string }>("SELECT app.addon_purchase_apply($1,'cs_bernay',NULL,'expired',0) AS s", [order.id]).then((r) => r.rows[0].s), "paid");
    assert.equal((await license(db, "bernay", "liquid-flow")).status, "active");
  } finally {
    await db.close();
  }
});

test("un second paiement du même add-on est signalé en doublon, pour remboursement, sans toucher la licence", async () => {
  const db = await database();
  try {
    const first = await openOrder(db);
    await asBilling(db);
    await reconcilePurchaseOn(db, gatewayFor(() => paidFacts(first.id)), first.id);
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO addon_purchases(id,restaurant_id,product_id,amount_cents,currency,product_version,stripe_session) VALUES('second','bernay','liquid-flow',500,'eur','1.0.0','cs_second')",
    );
    await asBilling(db);
    const facts = () => paidFacts("second");
    const result = await reconcilePurchaseOn(db, gatewayFor(facts), "second");
    assert.deepEqual(result, { status: "duplicate", refundIntent: "pi_second" });
    assert.equal((await license(db, "bernay", "liquid-flow")).purchase_id, first.id);
    // Le remboursement du doublon ne révoque pas la licence d’origine.
    await reconcilePurchaseOn(db, gatewayFor(() => paidFacts("second", { amountRefunded: 600 })), "second");
    assert.equal((await license(db, "bernay", "liquid-flow")).status, "active");
  } finally {
    await db.close();
  }
});

test("remboursement et litiges : révocation, suspension puis rétablissement, nouveau rachat possible", async () => {
  const db = await database();
  try {
    const order = await openOrder(db);
    let facts = paidFacts(order.id);
    const gateway = gatewayFor(() => facts);
    const sync = async () => {
      await asBilling(db);
      await reconcilePurchaseOn(db, gateway, order.id);
      return (await license(db, "bernay", "liquid-flow")).status;
    };
    assert.equal(await sync(), "active");
    await as(db, "nadia", "bernay");
    await db.query(SAVE, settingsArgs("liquid-flow", true, 0));
    assert.equal((await readLoadingScreen(db, "bernay"))?.renderer, "liquid");

    facts = paidFacts(order.id, { disputes: ["needs_response"] });
    assert.equal(await sync(), "disputed");
    await as(db, "sarah", "bernay");
    assert.equal(await readLoadingScreen(db, "bernay"), null, "écran suspendu : retour au natif");

    facts = paidFacts(order.id, { disputes: ["won"] });
    assert.equal(await sync(), "active");
    await as(db, "sarah", "bernay");
    assert.equal((await readLoadingScreen(db, "bernay"))?.renderer, "liquid", "réactivé sans nouvel achat");

    // Un remboursement partiel conserve la licence et réduit le revenu.
    facts = paidFacts(order.id, { amountRefunded: 100 });
    assert.equal(await sync(), "active");
    facts = paidFacts(order.id, { amountRefunded: 600 });
    assert.equal(await sync(), "revoked");
    await as(db, "nadia", "bernay");
    assert.equal(await readLoadingScreen(db, "bernay"), null);
    await assert.rejects(db.query(SAVE, settingsArgs("liquid-flow", true, 1)), /pas acquis/);
    const again = await db.query<Open>("SELECT * FROM app.addon_purchase_open('bernay','liquid-flow')");
    assert.notEqual(again.rows[0].id, order.id, "un établissement remboursé peut racheter");
  } finally {
    await db.close();
  }
});

test("derivePurchaseOutcome refuse toute session incohérente avec la commande", () => {
  const order = { id: "o1", status: "pending", amount_cents: 500, currency: "eur", stripe_session: "cs" };
  assert.equal(derivePurchaseOutcome(order, paidFacts("o1")).status, "paid");
  assert.throws(() => derivePurchaseOutcome(order, paidFacts("o1", { livemode: true })), /incompatible/);
  assert.throws(() => derivePurchaseOutcome(order, paidFacts("autre")), /incompatible/);
  assert.throws(() => derivePurchaseOutcome(order, paidFacts("o1", { mode: "subscription" })), /incompatible/);
  assert.throws(() => derivePurchaseOutcome(order, paidFacts("o1", { amountSubtotal: 100 })), /incompatible/);
  assert.throws(() => derivePurchaseOutcome(order, paidFacts("o1", { currency: "usd" })), /incompatible/);
  assert.equal(derivePurchaseOutcome(order, paidFacts("o1", { sessionStatus: "open", paymentStatus: "unpaid" })).status, null);
  assert.equal(derivePurchaseOutcome(order, paidFacts("o1", { sessionStatus: "expired", paymentStatus: "unpaid" })).status, "expired");
  assert.equal(derivePurchaseOutcome(order, paidFacts("o1", { disputes: ["lost"] })).status, "dispute_lost");
  assert.equal(derivePurchaseOutcome(order, paidFacts("o1", { disputes: ["warning_closed"] })).status, "paid");
});

test("prix : le catalogue serveur fait foi et un changement invalide une commande ouverte", async () => {
  const db = await database();
  try {
    const order = await openOrder(db);
    await db.exec("RESET ROLE");
    await db.query("UPDATE addon_products SET price_cents=650 WHERE id='liquid-flow'");
    await as(db, "nadia", "bernay");
    const reopened = (await db.query<Open>("SELECT * FROM app.addon_purchase_open('bernay','liquid-flow')")).rows[0];
    assert.equal(reopened.id, order.id);
    assert.equal(reopened.stale, true, "la page de paiement ouverte doit être fermée");
    assert.equal(reopened.amount_cents, 500);
    await asBilling(db);
    await reconcilePurchaseOn(db, gatewayFor(() => paidFacts(order.id, { sessionStatus: "expired", paymentStatus: "unpaid" })), order.id);
    await as(db, "nadia", "bernay");
    const fresh = (await db.query<Open>("SELECT * FROM app.addon_purchase_open('bernay','liquid-flow')")).rows[0];
    assert.notEqual(fresh.id, order.id);
    assert.equal(fresh.amount_cents, 650);
    assert.equal(fresh.stale, false);
  } finally {
    await db.close();
  }
});

test("réglages : écran acquis uniquement, réactivation gratuite, révision et héritage par l’équipe", async () => {
  const db = await database();
  try {
    await as(db, "nadia", "bernay");
    await assert.rejects(db.query(SAVE, settingsArgs("neon-pulse", true, 0)), /pas acquis/);
    await assert.rejects(db.query(SAVE, settingsArgs(null, true, 0)), /loading_screen_enabled_needs_product/);
    await db.query("SELECT app.addon_install_free('bernay','magic-loader')");
    await db.query("SELECT app.addon_install_free('bernay','studio-s')");
    const first = await db.query<{ revision: number }>(SAVE, ["bernay", "magic-loader", true, "#112233", "#445566", 1.5, false, "Bienvenue", 0]);
    assert.equal(first.rows[0].revision, 1);
    await assert.rejects(db.query(SAVE, settingsArgs("studio-s", true, 0)), /modifiée ailleurs/);

    await as(db, "sarah", "bernay");
    await assert.rejects(db.query(SAVE, settingsArgs("studio-s", true, 1)), /refusée/);
    await assert.rejects(db.query("UPDATE loading_screen_settings SET enabled=false"));
    // Une serveuse hérite de l’écran choisi par le gérant.
    const inherited = await readLoadingScreen(db, "bernay");
    assert.equal(inherited?.renderer, "magic");
    assert.equal(inherited?.primary, "#112233");
    assert.equal(inherited?.speed, 1.5);
    assert.equal(inherited?.message, "Bienvenue");

    await as(db, "nadia", "bernay");
    await db.query(SAVE, settingsArgs("studio-s", true, 1));
    await as(db, "sarah", "bernay");
    assert.equal((await readLoadingScreen(db, "bernay"))?.renderer, "studio-s", "changement immédiat");

    await as(db, "nadia", "bernay");
    await db.query(SAVE, settingsArgs("studio-s", false, 2));
    assert.equal(await readLoadingScreen(db, "bernay"), null, "désactivé : retour à l’écran natif");
    await db.query(SAVE, settingsArgs("magic-loader", true, 3));
    assert.equal((await readLoadingScreen(db, "bernay"))?.renderer, "magic", "réactivation d’un écran conservé");
    assert.equal((await license(db, "bernay", "studio-s")).status, "active", "la bibliothèque reste complète");
  } finally {
    await db.close();
  }
});

test("isolation : achats, licences et réglages restent dans leur établissement", async () => {
  const db = await database();
  try {
    await as(db, "nadia", "bernay");
    await db.query("SELECT app.addon_install_free('bernay','magic-loader')");
    await db.query(SAVE, ["bernay", "magic-loader", true, "#112233", null, 1, false, "Bernay", 0]);
    // Même propriétaire, autre établissement sélectionné : un membre multi-sites change d’écran.
    await as(db, "nadia", "atelier");
    assert.equal(await readLoadingScreen(db, "atelier"), null);
    assert.equal((await db.query("SELECT * FROM loading_screen_settings")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM addon_licenses WHERE product_id='magic-loader'")).rows.length, 0);
    assert.equal(await readLoadingScreen(db, "bernay"), null, "contexte Atelier : Bernay reste invisible");
    await assert.rejects(
      db.query("SELECT app.loading_screen_save('atelier','magic-loader',true,NULL,NULL,1,false,NULL,0)"),
      /pas acquis/,
    );
    await db.query("SELECT app.addon_install_free('atelier','studio-s')");
    await db.query("SELECT app.loading_screen_save('atelier','studio-s',true,NULL,NULL,1,false,'Atelier',0)");
    assert.equal((await readLoadingScreen(db, "atelier"))?.renderer, "studio-s");
    await as(db, "nadia", "bernay");
    assert.equal((await readLoadingScreen(db, "bernay"))?.renderer, "magic");

    // Sarah n’appartient qu’à Bernay : le contexte Atelier ne lui ouvre rien.
    await as(db, "sarah", "atelier");
    assert.equal(await readLoadingScreen(db, "atelier"), null);
    await assert.rejects(db.query("SELECT app.addon_install_free('atelier','magic-loader')"), /refusée/);
    await assert.rejects(db.query("SELECT * FROM app.addon_purchase_open('atelier','liquid-flow')"), /refusé/);
    // Un contexte public (site client) ne lit aucune configuration interne.
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('app.public','true',false),set_config('app.restaurant_id','bernay',false),set_config('app.user_id','',false)");
    await db.exec("SET ROLE atacuisine_app");
    assert.equal((await db.query("SELECT * FROM loading_screen_settings")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM addon_licenses")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("administration : réservée à la plateforme, prix sans code, retrait sans perte de licence", async () => {
  const db = await database();
  try {
    await as(db, "nadia", "bernay");
    await assert.rejects(db.query("SELECT * FROM app.addon_admin_stats()"), /refusée/);
    await assert.rejects(db.query("SELECT app.addon_admin_delete_category('loading-screens')"), /refusée/);
    await assert.rejects(db.query("UPDATE addon_products SET price_cents=1"));
    await db.query("SELECT app.addon_install_free('bernay','magic-loader')");

    await db.exec("RESET ROLE");
    await db.query("INSERT INTO platform_admins VALUES('slimane')");
    await db.query("SELECT set_config('app.user_id','slimane',false),set_config('app.restaurant_id','',false)");
    await db.exec("SET ROLE atacuisine_app");
    const product = {
      id: "magic-loader",
      categoryId: "loading-screens",
      kind: "loading_screen",
      renderer: "magic",
      name: "Magic Loader",
      description: "Retiré",
      pricingMode: "free",
      priceCents: 0,
      sellable: false,
      listed: false,
      version: "1.1.0",
      position: 1,
    };
    await db.query("SELECT app.addon_admin_save_product($1::jsonb)", [JSON.stringify(product)]);
    await db.query("SELECT app.addon_admin_save_product($1::jsonb)", [
      JSON.stringify({ ...product, id: "neon-pulse", renderer: "neon", name: "Neon Pulse", pricingMode: "one_time", priceCents: 650, sellable: true, listed: true }),
    ]);
    await db.query("SELECT app.addon_admin_save_category($1::jsonb)", [
      JSON.stringify({ id: "themes", name: "Thèmes et apparence", description: "", position: 20, visible: true }),
    ]);
    assert.equal((await db.query("SELECT id FROM addon_categories WHERE id='themes'")).rows.length, 1);
    await db.query("SELECT app.addon_admin_delete_category('themes')");
    await assert.rejects(db.query("SELECT app.addon_admin_delete_category('loading-screens')"), /contient encore/);
    const price = await db.query<{ price_cents: number }>("SELECT price_cents FROM addon_products WHERE id='neon-pulse'");
    assert.equal(price.rows[0].price_cents, 650);
    assert.equal((await license(db, "bernay", "magic-loader")).status, "active", "retiré du catalogue, toujours possédé");

    await as(db, "nadia", "bernay");
    await db.query(SAVE, settingsArgs("magic-loader", true, 0));
    assert.equal((await readLoadingScreen(db, "bernay"))?.renderer, "magic");
    await assert.rejects(db.query("SELECT app.addon_install_free('atelier','magic-loader')"), /refusée/);

    const order = await openOrder(db, "bernay", "neon-pulse", "cs_neon");
    await asBilling(db);
    await reconcilePurchaseOn(db, gatewayFor(() => paidFacts(order.id, { amountSubtotal: 650, amountRefunded: 100, chargeAmount: 780 })), order.id);
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('app.user_id','slimane',false)");
    await db.exec("SET ROLE atacuisine_app");
    const stats = await db.query<{ product_id: string; installations: number; active_uses: number; sales: number; revenue_cents: string | number }>("SELECT * FROM app.addon_admin_stats()");
    const neon = stats.rows.find((row) => row.product_id === "neon-pulse")!;
    assert.equal(neon.sales, 1);
    assert.equal(Number(neon.revenue_cents), 550, "revenu net du remboursement partiel");
    const magic = stats.rows.find((row) => row.product_id === "magic-loader")!;
    assert.equal(magic.installations, 1);
    assert.equal(magic.active_uses, 1);
    assert.equal((await db.query("SELECT * FROM app.addon_admin_purchases(10)")).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("migration descendante : l’addon Estimation est retiré sans toucher aux abonnements", async () => {
  const db = await database();
  try {
    await db.exec(await readFile("database/migrations/down/072_estimation.sql", "utf8"));
    const left = await db.query("SELECT tablename FROM pg_tables WHERE tablename='estimation_configs'");
    assert.equal(left.rows.length, 0);
    assert.equal((await db.query("SELECT id FROM addon_products WHERE id='estimation-studio'")).rows.length,0);
    await db.query("SELECT 1 FROM addon_subscriptions");
  } finally {
    await db.close();
  }
});

const product = (overrides: Partial<StoreProduct>): StoreProduct => ({
  id: "x",
  category_id: "loading-screens",
  kind: "loading_screen",
  renderer: "neon",
  name: "X",
  description: "",
  pricing_mode: "one_time",
  price_cents: 500,
  currency: "eur",
  sellable: true,
  listed: true,
  version: "1",
  compatibility: ["mobile"],
  ...overrides,
});
const owned = (id: string, status: StoreLicense["status"] = "active"): StoreLicense => ({ product_id: id, status, source: "purchase" });

test("boutique : bouton selon le statut, filtres et prix affiché", () => {
  const paid = product({ id: "paid" });
  const free = product({ id: "free", pricing_mode: "free", price_cents: 0 });
  assert.equal(productAction(free, undefined, false, null), "install");
  assert.equal(productAction(paid, undefined, false, null), "buy");
  assert.equal(productAction(paid, undefined, true, null), "resume");
  assert.equal(productAction(paid, owned("paid"), false, null), "activate");
  assert.equal(productAction(paid, owned("paid"), false, "paid"), "active");
  assert.equal(productAction(paid, owned("paid", "disputed"), false, null), "suspended");
  assert.equal(productAction(paid, owned("paid", "revoked"), false, null), "buy");
  assert.equal(productAction(product({ sellable: false }), undefined, false, null), "unavailable");
  assert.equal(productAction(product({ pricing_mode: "subscription" }), undefined, false, null), "unavailable");
  // Un achat reste activable même après son retrait du catalogue.
  assert.equal(productAction(product({ id: "paid", listed: false }), owned("paid"), false, null), "activate");

  const list = [paid, free, product({ id: "off", sellable: false }), product({ id: "other", category_id: "themes" })];
  const ids = (filters: Partial<typeof defaultStoreFilters>) =>
    filterProducts(list, [owned("paid")], { ...defaultStoreFilters, ...filters }).map((entry) => entry.id);
  assert.equal(ids({}).length, 4);
  assert.deepEqual(ids({ price: "free" }), ["free"]);
  assert.deepEqual(ids({ category: "themes" }), ["other"]);
  assert.deepEqual(ids({ availability: "unavailable" }), ["off"]);
  assert.deepEqual(ids({ acquisition: "owned" }), ["paid"]);
  assert.ok(!ids({ acquisition: "not-owned" }).includes("paid"));
  assert.deepEqual(categoryCounts(list, [owned("paid")], defaultStoreFilters, 3), {
    "loading-screens": 3,
    themes: 1,
    features: 3,
    all: 7,
  });
  assert.equal(installedAddonCount(["floor", "booking"], [
    { product_id: "magic-loader", status: "active", valid_until: null },
    { product_id: "floor", status: "active", valid_until: null },
    { product_id: "expired", status: "active", valid_until: "2020-01-01T00:00:00Z" },
  ], [{ addon_id: "booking", installed: false }], Date.parse("2026-11-10")), 2);
  assert.equal(featuresVisible(defaultStoreFilters), true);
  assert.equal(featuresVisible({ ...defaultStoreFilters, category: "loading-screens" }), false);
  assert.equal(featuresVisible({ ...defaultStoreFilters, price: "free" }), false);
  assert.equal(formatPrice(free), "Gratuit");
  assert.equal(formatPrice(paid), "5 € TTC");
  assert.equal(formatPrice(product({ price_cents: 650 })), "6,50 € TTC");
});

test("réglages : validation serveur des couleurs, vitesse, message et logo", () => {
  const valid = { productId: "a", enabled: true, primaryColor: null, secondaryColor: "#aabbcc", speed: 1, showLogo: false, message: "Bonjour", revision: 0 };
  assert.equal(loadingSettingsSchema.safeParse(valid).success, true);
  for (const invalid of [
    { primaryColor: "red;background:url(x)" },
    { speed: 5 },
    { message: "x".repeat(81) },
    { message: "a\nb" },
    { productId: null },
    { restaurant: "atelier" },
  ])
    assert.equal(loadingSettingsSchema.safeParse({ ...valid, ...invalid }).success, false, JSON.stringify(invalid));
  assert.equal(safeLogo("/uploads/logo.png"), "/uploads/logo.png");
  assert.equal(safeLogo("https://cdn.example.test/l.png"), "https://cdn.example.test/l.png");
  for (const unsafe of ["//evil.test/x.png", "javascript:alert(1)", "http://evil.test/x.png", "data:image/svg+xml,<svg>", 5, null])
    assert.equal(safeLogo(unsafe), null);
  const row = { renderer: "golden", primary_color: "#000000", secondary_color: "#000000", speed: "1.5", show_logo: true, message: "" };
  const golden = resolveLoadingConfig("bernay", row, "/l.png")!;
  assert.equal(golden.primary, loadingRenderers.golden.primary, "couleurs non modifiables sur cette animation");
  assert.equal(golden.speed, 1.5);
  assert.equal(golden.logo, "/l.png");
  assert.equal(golden.message, null);
  assert.equal(resolveLoadingConfig("bernay", { ...row, renderer: "inconnu" }, null), null);
  assert.equal(resolveLoadingConfig("bernay", { ...row, show_logo: false }, "/l.png")!.logo, null);
});

test("cache local : aucune configuration d’un autre établissement ni donnée invalide", () => {
  const config = { restaurant: "bernay", renderer: "neon", primary: "#112233", secondary: "#445566", speed: 1, logo: null, message: "Salut", background: null, text: null };
  const raw = JSON.stringify(config);
  assert.equal(parseLoadingCache(raw, "bernay")?.renderer, "neon");
  assert.equal(parseLoadingCache(raw, "atelier"), null);
  assert.equal(parseLoadingCache(null, "bernay"), null);
  assert.equal(parseLoadingCache("{invalide", "bernay"), null);
  assert.equal(parseLoadingCache(JSON.stringify({ ...config, renderer: "inconnu" }), "bernay"), null);
  assert.equal(parseLoadingCache(JSON.stringify({ ...config, primary: "url(x)" }), "bernay"), null);
  assert.equal(parseLoadingCache(JSON.stringify({ ...config, logo: "javascript:alert(1)" }), "bernay")?.logo, null);
  assert.equal(restaurantFromLocation("/dashboard", "?restaurant=atelier&module=addons"), "atelier");
  assert.equal(restaurantFromLocation("/restaurant/bernay/site", ""), "bernay");
  assert.equal(restaurantFromLocation("/dashboard", ""), null);
});

test("performances et accessibilité : animations légères, chargées à la demande, sans dépendance", async () => {
  const engine = await readFile("src/components/loading-screens/engine.tsx", "utf8");
  const css = await readFile("src/components/loading-screens/engine.css", "utf8");
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  assert.match(css, /is-paused[\s\S]*animation-play-state: paused/);
  const files = await readdir("src/components/loading-screens/screens");
  for (const id of loadingRendererIds) {
    if (isThemedVisual(id)) continue;
    assert.ok(engine.includes(`import("./screens/${id}")`), `${id} doit être importé à la demande`);
    assert.ok(!engine.includes(`from "./screens/${id}"`), `${id} ne doit pas être dans le lot initial`);
    assert.ok(files.includes(`${id}.tsx`) && files.includes(`${id}.css`));
    const source = await readFile(`src/components/loading-screens/screens/${id}.tsx`, "utf8");
    const style = await readFile(`src/components/loading-screens/screens/${id}.css`, "utf8");
    assert.match(style, /@keyframes/, `${id} doit être réellement animé`);
    assert.match(style, /var\(--ls-speed\)/, `${id} doit suivre le réglage de vitesse`);
    assert.doesNotMatch(source, /setTimeout|setInterval|requestAnimationFrame|fetch\(/, `${id} ne bloque ni ne retarde rien`);
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    assert.ok(imports.every((entry) => entry === "react" || entry.startsWith("@/components/brand")), `${id} : aucune dépendance lourde`);
    for (const color of ["--ls-primary", "--ls-secondary"])
      if ((loadingRenderers[id] as { colorable: boolean }).colorable)
        assert.ok(style.includes(color) || source.includes(color), `${id} doit utiliser ${color}`);
  }
  assert.ok(engine.includes('import("./screens/themed")'), "le lot thématique reste chargé à la demande");
  const themedSource = await readFile("src/components/loading-screens/screens/themed.tsx", "utf8");
  const themedStyle = await readFile("src/components/loading-screens/screens/themed.css", "utf8");
  assert.match(themedStyle, /@keyframes/);
  assert.match(themedStyle, /var\(--ls-speed\)/);
  assert.doesNotMatch(themedSource, /setTimeout|setInterval|requestAnimationFrame|fetch\(/);
  const loader = await readFile("src/components/loading-screens/tenant-loader.tsx", "utf8");
  assert.doesNotMatch(loader, /await[^;]*\n?[^;]*TenantLoader/);
  assert.match(loader, /UtensilsLoader/, "fallback natif immédiat");
});
