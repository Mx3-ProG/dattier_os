import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { roles, type Role } from "../src/core/permissions";
import { workspaceNavigation } from "../src/features/navigation/catalog";
import { moduleRegistry } from "../src/core/modules/catalog";
import {
  moduleManifest,
  validateManifest,
  moduleForNavigation,
  type ModuleManifest,
} from "../src/core/modules/manifest";
import { availableModules, moduleAvailable } from "../src/features/modules/availability";
import type { DB } from "../src/infrastructure/database/types";

test("the manifest covers every workspace screen and the suspendable modules", () => {
  for (const entry of workspaceNavigation.list())
    assert.ok(moduleForNavigation(entry.id), `navigation without module: ${entry.id}`);
  for (const definition of moduleRegistry.list())
    assert.ok(moduleManifest.some((entry) => entry.id === definition.id), definition.id);
});

test("the manifest encodes the Studio scope decided on 10 November 2026", () => {
  const offer = (id: string) => moduleManifest.find((entry) => entry.id === id)?.offer;
  for (const id of ["overview", "activity", "table-booking", "stock", "trade-tools", "team", "finance", "bank", "payouts", "settings", "security"])
    assert.equal(offer(id), "included", id);
  // Décision du 12 novembre 2026 : commandes, cuisine et bar sont des modules gratuits à activer selon le métier.
  for (const id of ["website", "orders", "kitchen", "bar"]) assert.equal(offer(id), "included-optional", id);
  for (const id of ["online-orders", "floor", "recipes", "suppliers", "deliveries", "attendance", "payroll", "client-invoices", "invoices", "expenses"])
    assert.equal(offer(id), "addon-monthly", id);
  const shop = moduleManifest.find((entry) => entry.id === "online-orders")!;
  assert.ok((shop.requires as readonly string[]).includes("website"));
  // Réservations et commandes ne dépendent plus du plan de salle ni de la cuisine.
  for (const id of ["table-booking", "orders"])
    assert.equal((moduleManifest.find((entry) => entry.id === id)!.requires as readonly string[]).some((d) => ["floor", "kitchen", "bar"].includes(d)), false);
});

test("manifest validation rejects unknown, circular and paid-in-included dependencies", () => {
  const base: ModuleManifest = { id: "a", label: "A", family: "pilotage", offer: "included", requires: [], enhancedBy: [], navigation: [], industries: [], legacy: { kind: "always" } };
  assert.throws(() => validateManifest([{ ...base, requires: ["missing"] }]), /Invalid dependency/);
  assert.throws(() => validateManifest([{ ...base, requires: ["b"] }, { ...base, id: "b", requires: ["a"] }]), /Circular/);
  assert.throws(() => validateManifest([{ ...base, requires: ["b"] }, { ...base, id: "b", offer: "addon-monthly" }]), /paid/);
  assert.throws(() => validateManifest([{ ...base, navigation: ["x"] }, { ...base, id: "b", navigation: ["x"] }]), /twice/);
  assert.throws(() => validateManifest([base, base]), /duplicate/);
});

/** Contexte commercial du poste de travail, calculé comme src/application/snapshot.ts. */
async function legacyNavigation(db: PGlite, restaurant: string) {
  const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const [{ plan }] = await one<{ plan: number | null }>("SELECT app.restaurant_plan($1) AS plan", [restaurant]);
  const [{ industry }] = await one<{ industry: string }>("SELECT industry FROM restaurants WHERE id=$1", [restaurant]);
  const enabled = async (module: string) =>
    (await one<{ allowed: boolean }>("SELECT app.module_enabled($1::text,$2::text) AS allowed", [restaurant, module]))[0].allowed === true;
  const addons = (await one<{ addon: string }>(
    `SELECT addon FROM unnest(ARRAY['invoices','attendance','client-invoices','payroll',
      'offline-conflicts','connections','qr','loyalty','domain']) AS addon WHERE app.addon_installed($1,addon)`, [restaurant],
  )).map((row) => row.addon);
  const licenses = (await one<{ product_id: string; kind: string }>(
    "SELECT l.product_id,p.kind FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id WHERE l.restaurant_id=$1 AND p.kind IN ('analytics','estimation','business','operations') AND app.addon_installed($1,l.product_id)",
    [restaurant],
  )).flatMap((license) => (license.kind === "business" ? [license.product_id, "trade-tools"] : [license.product_id]));
  const uninstalledAddons = (await one<{ addon_id: string }>(
    "SELECT addon_id FROM addon_installations WHERE restaurant_id=$1 AND NOT installed", [restaurant],
  )).map((row) => row.addon_id);
  const context = {
    plan: plan ?? 0,
    addons,
    licenses,
    uninstalledAddons,
    activeModules: { floor: await enabled("floor"), "table-booking": await enabled("table-booking") },
  };
  const screens = (role: Role | readonly Role[]) => workspaceNavigation
    .resolve({ ...context, roles: role })
    .map((entry) => entry.id);
  return { visible: new Set(screens(roles)), screens, context, industry };
}

/** Ancienne décision d'un module : son écran, ou à défaut l'add-on dont il dépend aujourd'hui. */
async function legacyDecision(db: PGlite, restaurant: string, entry: ModuleManifest) {
  const nav = await legacyNavigation(db, restaurant);
  if (entry.navigation.length) {
    const states = entry.navigation.map((id) => nav.visible.has(id));
    assert.equal(new Set(states).size, 1, `${entry.id}: its screens disagree today`);
    return states[0];
  }
  if (entry.legacy.kind === "always") return true;
  // Règle « plan » : l'accès suit l'abonnement Studio actif.
  if (entry.legacy.kind === "plan")
    return (
      await db.query<{ studio: boolean }>(
        "SELECT coalesce(app.restaurant_plan($1),0)>=39 AS studio",
        [restaurant],
      )
    ).rows[0].studio;
  if (entry.legacy.kind === "license-kind")
    return (await db.query<{ ok: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id WHERE l.restaurant_id=$1 AND p.kind=$2 AND app.addon_installed($1,l.product_id)) AS ok",
      [restaurant, entry.legacy.productKind],
    )).rows[0].ok;
  assert.equal(entry.legacy.kind, "addon", `${entry.id}: no screen and no add-on to compare with`);
  const addon = (entry.legacy as { addon: string }).addon;
  return (await db.query<{ ok: boolean }>("SELECT app.addon_installed($1,$2) AS ok", [restaurant, addon])).rows[0].ok;
}

async function assertEquivalent(db: PGlite, step: string) {
  for (const restaurant of ["bernay", "atelier"]) {
    const modules = await availableModules(db as unknown as DB, restaurant);
    const available = new Set(modules);
    // Bascule P1-a2 : la navigation lue depuis `modules` affiche exactement les mêmes
    // écrans que l'ancien calcul, pour chaque rôle seul et pour tous les rôles cumulés.
    const nav = await legacyNavigation(db, restaurant);
    for (const role of [...roles.map((r) => r as Role | readonly Role[]), roles]) {
      const switched = workspaceNavigation
        .resolve({ ...nav.context, roles: role, modules })
        .map((entry) => entry.id);
      assert.deepEqual(switched, nav.screens(role), `${step} / ${restaurant} / ${String(role)}`);
    }
    for (const entry of moduleManifest) {
      const expected = await legacyDecision(db, restaurant, entry);
      assert.equal(available.has(entry.id), expected, `${step} / ${restaurant} / ${entry.id}`);
    }
  }
}

test("module_available reproduces today's access decision in every commercial state", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    await assertEquivalent(db, "seed");

    // Add-ons désinstallés (sans passer par les contrôles métier, pour couvrir tous les cas).
    await db.exec(`INSERT INTO addon_installations(restaurant_id,addon_id,installed) VALUES
      ('bernay','website',false),('bernay','qr',false),('bernay','attendance',false),
      ('bernay','loyalty',false),('atelier','booking',false),('atelier','online-orders',false)`);
    await assertEquivalent(db, "uninstalled");

    // Licences de la boutique : actives, expirée, désinstallée.
    await db.exec(`INSERT INTO addon_licenses(restaurant_id,product_id,source,status,valid_until) VALUES
      ('bernay','earth-tracker-3d','free','active',NULL),
      ('bernay','abandoned-cart','free','active',now()-interval '1 day'),
      ('atelier','abandoned-cart','free','active',NULL),
      ('atelier','earth-tracker-3d','free','active',NULL)`);
    await db.exec("INSERT INTO addon_installations(restaurant_id,addon_id,installed) VALUES('atelier','earth-tracker-3d',false)");
    await assertEquivalent(db, "licenses");

    // Droit hérité retiré.
    await db.exec("DELETE FROM addon_legacy_grants WHERE restaurant_id='atelier' AND addon_id IN ('payroll','invoices')");
    await assertEquivalent(db, "grants");

    // Suspension appliquée du plan de salle.
    await db.exec("UPDATE reservations SET status='cancelled' WHERE restaurant_id='bernay'");
    await db.exec("INSERT INTO module_settings(restaurant_id,module_id,requested_state,applied_state,revision,updated_by) VALUES('bernay','floor','suspended','suspended',1,'nadia')");
    await assertEquivalent(db, "suspended");

    // Autre secteur que la restauration.
    await db.exec("UPDATE restaurants SET industry='beauty' WHERE id='atelier'");
    await assertEquivalent(db, "industry");

    // Abonnement Studio inactif.
    await db.exec("UPDATE app.organization_plans SET plan=0");
    await assertEquivalent(db, "no-plan");
  } finally {
    await db.close();
  }
});

test("module_available fails closed for unknown modules and foreign businesses", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const run = (user: string, restaurant: string, module: string) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)", [user, restaurant]);
      return (await tx.query<{ ok: boolean | null }>("SELECT app.module_available($1,$2) AS ok", [restaurant, module])).rows[0].ok;
    });
    assert.equal(await run("nadia", "bernay", "activity"), true);
    assert.equal(await run("nadia", "bernay", "unknown-module"), null);
    assert.equal(await run("nobody", "bernay", "activity"), false);
    assert.equal(await run("nobody", "bernay", "unknown-module"), null);
    assert.equal(await moduleAvailable(db as unknown as DB, "bernay", "unknown" as never), false);
    assert.equal(await moduleAvailable(db as unknown as DB, "bernay", "activity"), true);
  } finally {
    await db.close();
  }
});
