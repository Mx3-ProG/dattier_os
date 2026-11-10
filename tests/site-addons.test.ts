import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { website } from "../src/features/cms/service";
import { registry } from "../src/features/cms/registry";
import { sectionProps, siteConfigSchema } from "../src/features/cms/schema";
import {
  addonSectionAddons,
  effectiveNotFound,
  effectiveSiteDecoration,
  effectiveSiteBackground,
  effectiveSiteLoader,
  emptySiteAddons,
  parseSiteAddons,
  postcodeZone,
  siteLoaderKey,
} from "../src/features/cms/site-addons";
import { tradePerformOn, type Scoped } from "../src/features/trade/service";
import { withDatabaseContext } from "../src/lib/database/context";
import type { DB } from "../src/lib/database/db";
import { isSiteBackground, siteBackgrounds, siteBackgroundStyle } from "../src/features/cms/site-backgrounds";
import { themedVisualIds, themedVisuals, themedPrice } from "../src/features/cms/themed-visuals";

const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
const scoped: Scoped = { ...owner, roles: ["OWNER"] };
async function database() {
  const db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  return db;
}
const app = <T>(db: PGlite, r: string, fn: (tx: DB) => Promise<T>, isPublic = false) =>
  withDatabaseContext({ userId: isPublic ? undefined : "nadia", restaurantId: r, public: isPublic }, () =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id',$2,true),set_config('app.restaurant_id',$1,true),set_config('app.public',$3,true)",
        [r, isPublic ? "" : "nadia", String(isPublic)],
      );
      return fn(tx as unknown as DB);
    }),
  );
const install = (db: PGlite, r: string, tool: string) =>
  app(db, r, async (tx) => {
    await tx.query("SELECT app.addon_install_free($1,$2)", [r, tool]);
  });

test("catalogue : pages 404 initiales et deux collections thématiques aux prix TTC prévus", async () => {
  const db = await database();
  try {
    const { rows } = await db.query<{ id: string; renderer: string; pricing_mode: string; price_cents: number }>(
      "SELECT id,renderer,pricing_mode,price_cents FROM addon_products WHERE kind='not_found' ORDER BY position",
    );
    assert.deepEqual(rows.slice(0, 17).map((row) => [row.renderer, row.price_cents]), [
      ["plate", 0], ["compass", 0], ["neon", 300], ["stars", 300],
      ["trail", 0], ["portal", 0], ["lantern", 0], ["map", 0], ["balloon", 0],
      ["snowglobe", 600], ["candy", 600], ["gingerbread", 600], ["gifts", 600],
      ["aurora", 900], ["village", 900], ["forest", 900], ["advent", 900],
    ]);
    assert.deepEqual(rows.slice(17).map((row) => [row.renderer, row.price_cents]), themedVisualIds.map((id) => [id, themedPrice(id)]));
    for (const type of Object.keys(addonSectionAddons) as (keyof typeof addonSectionAddons)[]) {
      assert.equal(registry[type].addon, addonSectionAddons[type], `${type} : add-on requis cohérent`);
      assert.ok(registry[type].addable);
      assert.ok(sectionProps[type].safeParse(registry[type].create!()).success, `${type} : valeurs par défaut valides`);
    }
  } finally {
    await db.close();
  }
});

test("catalogue : quarante-cinq fonds, prix TTC et modèles utilisables", async () => {
  const db = await database();
  try {
    const { rows } = await db.query<{ renderer: string; price_cents: number; pricing_mode: string }>(
      "SELECT renderer,price_cents,pricing_mode FROM addon_products WHERE kind='site_background' ORDER BY position",
    );
    assert.equal(rows.length, 45);
    assert.deepEqual(rows.slice(0, 21).map((row) => row.price_cents), [0,0,0,900,900,900,1900,1900,1900,0,0,0,0,0,0,900,900,900,900,900,900]);
    assert.deepEqual(rows.slice(21).map((row) => [row.renderer, row.price_cents]), themedVisualIds.map((id) => [id, themedPrice(id)]));
    assert.ok(rows.every((row) => isSiteBackground(row.renderer)));
    assert.deepEqual(rows.map((row) => row.renderer).toSorted(), Object.keys(siteBackgrounds).toSorted());
    assert.ok(rows.every((row) => siteBackgroundStyle(row.renderer as keyof typeof siteBackgrounds).backgroundImage));
  } finally { await db.close(); }
});

test("espace et nature : 96 produits, quatre familles et quatre paliers identiques", async () => {
  const db = await database();
  try {
    const { rows } = await db.query<{ kind: string; renderer: string; price_cents: number }>(
      "SELECT kind,renderer,price_cents FROM addon_products WHERE renderer LIKE 'space-%' OR renderer LIKE 'nature-%' ORDER BY kind,position",
    );
    assert.equal(rows.length, 96);
    for (const kind of ["site_background", "not_found", "loading_screen", "site_decoration"]) {
      const family = rows.filter((row) => row.kind === kind);
      assert.equal(family.length, 24);
      assert.deepEqual(family.map((row) => [row.renderer, row.price_cents]), themedVisualIds.map((id) => [id, themedPrice(id)]));
      for (const prefix of ["space-", "nature-"])
        assert.deepEqual(family.filter((row) => row.renderer.startsWith(prefix)).map((row) => row.price_cents), [0,0,0,600,600,600,900,900,900,1900,1900,1900]);
    }
    assert.equal(Object.keys(themedVisuals).length, 24);
  } finally { await db.close(); }
});

test("données publiques : seulement les add-ons installés, les lots actifs et aucune donnée client", async () => {
  const db = await database();
  try {
    const before = parseSiteAddons(await app(db, "bernay", async (tx) => (await tx.query<{ d: unknown }>("SELECT app.site_addon_data('bernay') AS d")).rows[0].d, true));
    assert.equal(before.installed.includes("shipping-rules"), false);
    assert.deepEqual(before.shipping, []);
    for (const tool of ["shipping-rules", "product-bundles", "appointment-booking", "menu-allergens", "not-found-compass", "magic-loader"]) await install(db, "bernay", tool);
    await app(db, "bernay", async (tx) => {
      await tradePerformOn(tx, "bernay", scoped, "shipping-rules", { action: "create", entity: "zone", data: { name: "Paris", postcodes: "75", mode: "Livraison", fee: 490, freeAbove: 4000, delay: 1 } });
      const menu = (await tx.query<{ id: string }>("SELECT id FROM menu_items WHERE restaurant_id='bernay' AND archived_at IS NULL ORDER BY id LIMIT 2")).rows.map((row) => row.id);
      await tradePerformOn(tx, "bernay", scoped, "product-bundles", { action: "create", entity: "bundle", data: { name: "Duo", items: menu, price: 1500, status: "Actif" } });
      await tradePerformOn(tx, "bernay", scoped, "product-bundles", { action: "create", entity: "bundle", data: { name: "Secret", items: menu, price: 900, status: "En pause" } });
      await tradePerformOn(tx, "bernay", scoped, "appointment-booking", { action: "create", entity: "service", data: { name: "Coupe", duration: 30, price: 2500 } });
      await tradePerformOn(tx, "bernay", scoped, "appointment-booking", { action: "create", entity: "appointment", data: { client: "Client privé", phone: "0600000000", service: (await tx.query<{ id: string }>("SELECT id FROM trade_records WHERE entity='service'")).rows[0].id, start: new Date().toISOString(), status: "Confirmé" } });
    });
    const raw = await app(db, "bernay", async (tx) => (await tx.query<{ d: unknown }>("SELECT app.site_addon_data('bernay') AS d")).rows[0].d, true);
    const data = parseSiteAddons(raw);
    assert.ok(["shipping-rules", "product-bundles", "appointment-booking", "menu-allergens"].every((id) => data.installed.includes(id)));
    assert.deepEqual(data.shipping, [{ name: "Paris", postcodes: "75", mode: "Livraison", fee: 490, freeAbove: 4000, delay: 1 }]);
    assert.deepEqual(data.bundles.map((bundle) => [bundle.name, bundle.items.length]), [["Duo", 2]], "lot en pause exclu");
    assert.deepEqual(data.services, [{ name: "Coupe", duration: 30, price: 2500 }]);
    assert.doesNotMatch(JSON.stringify(raw), /Client privé|0600000000/, "aucun rendez-vous ni client exposé");
    assert.deepEqual(data.notFoundPages.map((page) => page.renderer), ["compass"]);
    assert.deepEqual(data.loadingScreens.map((screen) => screen.renderer), ["magic"]);
    // Un autre établissement ne reçoit rien de Bernay.
    const other = parseSiteAddons(await app(db, "atelier", async (tx) => (await tx.query<{ d: unknown }>("SELECT app.site_addon_data('atelier') AS d")).rows[0].d, true));
    assert.deepEqual([other.shipping, other.bundles, other.services, other.notFoundPages], [[], [], [], []]);
    // Désinstallé : ses données disparaissent du site.
    await app(db, "bernay", async (tx) => { await tx.query("SELECT app.addon_installation_set('bernay','shipping-rules',false)"); });
    const after = parseSiteAddons(await app(db, "bernay", async (tx) => (await tx.query<{ d: unknown }>("SELECT app.site_addon_data('bernay') AS d")).rows[0].d, true));
    assert.deepEqual(after.shipping, []);
    assert.equal(after.installed.includes("shipping-rules"), false);
  } finally {
    await db.close();
  }
});

test("éditeur : une section d’add-on n’est ajoutable que si l’add-on est installé, même pour un site existant", async () => {
  const db = await database();
  try {
    const cms = website("bernay");
    // Site existant avec une liste de blocs enregistrée avant l’arrivée des sections d’add-ons.
    await db.query("UPDATE restaurant_cms SET settings=$1::jsonb WHERE restaurant_id='bernay'", [JSON.stringify({ keepVersions: 30, allowedTypes: ["hero", "textBlock"] })]);
    const state = await app(db, "bernay", async (tx) => cms.editorState(tx, await cms.siteScope(tx, owner)));
    assert.equal(state.settings.allowedTypes.includes("delivery"), false);
    const withDelivery = () => {
      const config = structuredClone(state.config);
      config.pages.home.sections.push({ id: "livraison-1", type: "delivery", lock: 1, visible: true, required: false, props: registry.delivery.create!() } as never);
      return config;
    };
    await assert.rejects(
      app(db, "bernay", async (tx) => cms.siteAction(tx, await cms.siteScope(tx, owner), { op: "save", revision: state.revision, config: withDelivery() })),
      /n’est pas autorisé/,
    );
    await install(db, "bernay", "shipping-rules");
    const fresh = await app(db, "bernay", async (tx) => cms.editorState(tx, await cms.siteScope(tx, owner)));
    assert.ok(fresh.settings.allowedTypes.includes("delivery"));
    assert.ok(fresh.settings.allowedTypes.includes("hero"), "les choix du site sont conservés");
    assert.ok(fresh.siteAddons.installed.includes("shipping-rules"));
    await app(db, "bernay", async (tx) => cms.siteAction(tx, await cms.siteScope(tx, owner), { op: "save", revision: fresh.revision, config: withDelivery() }));
  } finally {
    await db.close();
  }
});

test("identité : écran de chargement et page 404 choisis uniquement parmi les add-ons acquis", async () => {
  const db = await database();
  try {
    const cms = website("bernay");
    const state = await app(db, "bernay", async (tx) => cms.editorState(tx, await cms.siteScope(tx, owner)));
    const save = (mutate: (config: typeof state.config) => void, revision: number) => {
      const config = structuredClone(state.config);
      mutate(config);
      return app(db, "bernay", async (tx) => cms.siteAction(tx, await cms.siteScope(tx, owner), { op: "save", revision, config }));
    };
    await assert.rejects(save((c) => { c.branding.loader = { product: "golden-luxury" }; }, state.revision), /écran de chargement n’est pas installé/);
    await assert.rejects(save((c) => { c.branding.notFound = { product: "not-found-neon", title: "", message: "", button: "" }; }, state.revision), /modèle de page 404 n’est pas installé/);
    await assert.rejects(save((c) => { c.branding.decoration = { product: "christmas-snowfall" }; }, state.revision), /décoration n’est pas installée/);
    await assert.rejects(save((c) => { c.branding.background = { product: "site-bg-xmas-aurora" }; }, state.revision), /fond de site n’est pas installé/);
    await assert.rejects(save((c) => { c.branding.decoration = { product: "site-decoration-nature-coral" }; }, state.revision), /décoration n’est pas installée/);
    await install(db, "bernay", "studio-s");
    await install(db, "bernay", "not-found-compass");
    await install(db, "bernay", "site-bg-xmas-trees");
    await install(db, "bernay", "site-decoration-space-orbit");
    const ownedBackgrounds = await app(db, "bernay", async (tx) => (await tx.query<{ data: { id: string }[] }>("SELECT app.site_background_data('bernay') AS data")).rows[0].data, true);
    assert.deepEqual(ownedBackgrounds.map((entry) => entry.id), ["site-bg-xmas-trees"]);
    const otherBackgrounds = await app(db, "atelier", async (tx) => (await tx.query<{ data: { id: string }[] }>("SELECT app.site_background_data('atelier') AS data")).rows[0].data, true);
    assert.deepEqual(otherBackgrounds, []);
    const saved = await save((c) => {
      c.branding.loader = { product: "studio-s" };
      c.branding.notFound = { product: "not-found-compass", title: "Perdu ?", message: "Suivez le guide.", button: "Accueil" };
      c.branding.background = { product: "site-bg-xmas-trees" };
      c.branding.decoration = { product: "site-decoration-space-orbit" };
    }, state.revision);
    assert.ok(saved);
    const draft = await app(db, "bernay", (tx) => cms.getDraftConfig(tx));
    assert.equal(draft.branding.notFound?.title, "Perdu ?");
    assert.equal(draft.branding.background?.product, "site-bg-xmas-trees");
    assert.equal(draft.branding.decoration?.product, "site-decoration-space-orbit");
    // Une ancienne configuration, sans ces champs, reste valide.
    const legacy = structuredClone(draft);
    delete legacy.branding.loader;
    delete legacy.branding.notFound;
    delete legacy.branding.background;
    assert.ok(siteConfigSchema.safeParse(legacy).success);
  } finally {
    await db.close();
  }
});

test("règles d’affichage : modèle par défaut, cache par site et vérificateur de code postal", () => {
  const owned = [{ id: "not-found-neon", renderer: "neon", name: "Néon" }];
  assert.equal(effectiveNotFound({ product: "not-found-neon" }, owned), "neon");
  assert.equal(effectiveNotFound({ product: "not-found-neon" }, []), "plate", "add-on désinstallé : retour au modèle par défaut");
  assert.equal(effectiveNotFound(undefined, owned), "plate");
  assert.equal(effectiveSiteLoader({ product: "magic-loader" }, [{ id: "magic-loader", renderer: "magic", name: "Magic" }]), "magic");
  assert.equal(effectiveSiteLoader({ product: "magic-loader" }, []), null);
  assert.equal(effectiveSiteDecoration({ product: "christmas-snowfall" }, [{ id: "christmas-snowfall", renderer: "snowfall", name: "Neige" }]), "snowfall");
  assert.equal(effectiveSiteDecoration({ product: "christmas-snowfall" }, []), null);
  assert.equal(effectiveSiteBackground({ product: "site-bg-xmas-trees" }, [{ id: "site-bg-xmas-trees", renderer: "xmas-trees", name: "Sapin" }]), "xmas-trees");
  assert.equal(effectiveSiteBackground({ product: "site-bg-xmas-trees" }, []), null);
  assert.equal(siteLoaderKey("127.0.0.1:3000", "/r/bernay/carte"), "studio-site-loader:v1:127.0.0.1:3000:bernay");
  assert.notEqual(siteLoaderKey("127.0.0.1:3000", "/r/bernay"), siteLoaderKey("127.0.0.1:3000", "/r/atelier"));
  assert.equal(siteLoaderKey("chez-nadia.fr", "/carte"), "studio-site-loader:v1:chez-nadia.fr:");
  const zones = [{ name: "Paris", postcodes: "75, 92", mode: "Livraison", fee: 500, freeAbove: null, delay: 1 }];
  assert.equal(postcodeZone(zones, "92 100")?.name, "Paris");
  assert.equal(postcodeZone(zones, "13001"), null);
  assert.equal(postcodeZone(zones, ""), null);
  assert.deepEqual(parseSiteAddons(null), emptySiteAddons);
});
