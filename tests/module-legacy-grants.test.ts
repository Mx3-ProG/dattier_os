import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { grandfatheredModules, moduleManifest } from "../src/core/modules/manifest";

test("grandfathered modules are the website and the online shop only", async () => {
  const sql = await readFile("database/migrations/091_module_legacy_grants.sql", "utf8");
  const check = /module_id IN \(([^)]*)\)/.exec(sql)![1].match(/'([a-z-]+)'/g)!.map((v) => v.slice(1, -1));
  assert.deepEqual([...check].sort(), [...grandfatheredModules].sort());
  // Décision du 10 novembre 2026 : seuls le site et la boutique sont conservés.
  assert.deepEqual([...grandfatheredModules].sort(), ["online-orders", "website"]);
  const scope = await readFile("database/migrations/092_module_legacy_grants_scope.sql", "utf8");
  assert.match(scope, /CHECK \(module_id IN \('website','online-orders'\)\)/);
  for (const id of grandfatheredModules) {
    const entry = moduleManifest.find((module) => module.id === id)!;
    assert.notEqual(entry.offer, "included", id);
    // Aujourd'hui compris dans l'abonnement : aucune vente séparée à préserver.
    assert.ok(["always", "plan", "module"].includes(entry.legacy.kind) ||
      (entry.legacy.kind === "addon" && ["website", "online-orders"].includes(entry.legacy.addon)), id);
  }
});

test("only paying subscribers receive legacy module rights, idempotently and tenant scoped", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const grants = async (restaurant: string) =>
      (await db.query<{ module_id: string }>("SELECT module_id FROM module_legacy_grants WHERE restaurant_id=$1 ORDER BY module_id", [restaurant])).rows.map((row) => row.module_id);

    await db.exec("UPDATE restaurants SET industry='beauty' WHERE id='atelier'");
    const added = (await db.query<{ n: number }>("SELECT app.record_module_legacy_grants() AS n")).rows[0].n;
    assert.deepEqual(await grants("bernay"), [...grandfatheredModules].sort());
    // Le secteur ne change rien : site et boutique valent pour tous les commerces.
    assert.deepEqual(await grants("atelier"), ["online-orders", "website"]);
    assert.equal(added, 4);
    assert.equal((await db.query<{ n: number }>("SELECT app.record_module_legacy_grants() AS n")).rows[0].n, 0);

    // Essai gratuit en cours : aucun droit hérité.
    await db.exec("DELETE FROM module_legacy_grants");
    await db.exec("UPDATE app.organization_plans SET plan=0,bonus_plan=0,trial_started_at=now(),trial_ends_at=now()+interval '3 days'");
    assert.equal((await db.query<{ plan: number }>("SELECT app.restaurant_plan('bernay') AS plan")).rows[0].plan, 39);
    assert.equal((await db.query<{ n: number }>("SELECT app.record_module_legacy_grants() AS n")).rows[0].n, 0);

    // Le rôle applicatif lit ses droits mais ne peut pas en créer.
    await db.exec("UPDATE app.organization_plans SET plan=39,trial_started_at=NULL,trial_ends_at=NULL");
    await db.query("SELECT app.record_module_legacy_grants()");
    const asApp = (user: string, restaurant: string, sql: string) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)", [user, restaurant]);
      return (await tx.query<{ module_id?: string; ok?: boolean }>(sql)).rows;
    });
    await assert.rejects(asApp("nadia", "bernay", "SELECT app.record_module_legacy_grants()"), /permission denied/);
    assert.equal((await asApp("nadia", "bernay", "SELECT app.module_legacy_granted('bernay','website') AS ok"))[0].ok, true);
    assert.equal((await asApp("nadia", "bernay", "SELECT app.module_legacy_granted('bernay','floor') AS ok"))[0].ok, false);
    assert.equal((await asApp("nobody", "bernay", "SELECT module_id FROM module_legacy_grants")).length, 0);
    assert.equal((await asApp("nobody", "bernay", "SELECT app.module_legacy_granted('bernay','website') AS ok"))[0].ok, false);
  } finally {
    await db.close();
  }
});

test("migration 092 aligns a database that applied the ten-module draft of 091", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    // État laissé par la version préliminaire : dix modules autorisés et accordés.
    await db.exec("ALTER TABLE module_legacy_grants DROP CONSTRAINT module_legacy_grants_module_id_check");
    await db.exec("INSERT INTO module_legacy_grants(restaurant_id,module_id) VALUES('bernay','website'),('bernay','floor'),('bernay','expenses')");
    await db.exec("DELETE FROM schema_versions WHERE version=92");
    await db.exec(await readFile("database/migrations/092_module_legacy_grants_scope.sql", "utf8"));
    const rows = (await db.query<{ module_id: string }>("SELECT module_id FROM module_legacy_grants ORDER BY module_id")).rows;
    assert.deepEqual(rows.map((row) => row.module_id), ["website"]);
    await assert.rejects(db.exec("INSERT INTO module_legacy_grants(restaurant_id,module_id) VALUES('bernay','kitchen')"), /check constraint/);
    assert.equal((await db.query<{ n: number }>("SELECT app.record_module_legacy_grants() AS n")).rows[0].n, 3);
  } finally {
    await db.close();
  }
});
