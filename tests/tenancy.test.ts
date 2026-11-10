import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { rows, type DB } from "../src/lib/database/db";
import { scope, type Actor } from "../src/lib/auth/session";
import { perform } from "../src/lib/actions";
import { snapshot } from "../src/lib/snapshot";
let db: PGlite;
const nadia: Actor = { id: "nadia", name: "Nadia", role: "OWNER" },
  hugo: Actor = { id: "hugo", name: "Hugo", role: "OWNER" };
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  // Un second client indépendant : sa propre organisation, une place Studio, sa propre équipe.
  await db.exec(`
    INSERT INTO organizations(id,name) VALUES('bistrot-org','Le Bistrot de Hugo — client fictif');
    SELECT app.configure_organization_plan('bistrot-org',39,1);
    INSERT INTO restaurants(id,name,address,phone,goal,organization_id)
      VALUES('bistrot','Le Bistrot de Hugo — structure fictive','Structure de démonstration indépendante','',60000,'bistrot-org');
    INSERT INTO profiles(id,name,role) VALUES('hugo','Hugo','OWNER');
    INSERT INTO organization_memberships VALUES('bistrot-org','hugo','OWNER');
    INSERT INTO memberships VALUES('hugo','bistrot','OWNER');`);
  await db.exec(
    "CREATE ROLE tenant_app NOLOGIN; GRANT USAGE ON SCHEMA public,app TO tenant_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO tenant_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO tenant_app;",
  );
});
after(async () => {
  await db.close();
});
async function asUser<T>(id: string, r: string, fn: (tx: DB) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE tenant_app");
    await tx.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)",
      [id, r],
    );
    return fn(tx);
  });
}
test("structures séparées : un propriétaire ne voit et ne modifie que sa structure", async () => {
  await assert.rejects(scope(db, hugo, "bernay"), /autorisé/);
  await assert.rejects(scope(db, nadia, "bistrot"), /autorisé/);
  const own = await db.transaction((tx) => snapshot(tx, hugo, "bistrot"));
  assert.deepEqual(
    own.restaurants.map((r) => r.id),
    ["bistrot"],
  );
  await assert.rejects(
    db.transaction(async (tx) =>
      perform(tx, "bernay", await scope(tx, hugo, "bernay"), {
        action: "restaurant",
        name: "Piratage",
        address: "",
        phone: "",
        goal: 1,
      }),
    ),
    /autorisé/,
  );
  // Database-level isolation, independent of the application checks.
  assert.equal(
    (
      await asUser("hugo", "bernay", (tx) =>
        rows(tx, "SELECT id FROM menu_items"),
      )
    ).length,
    0,
  );
  assert.deepEqual(
    (
      await asUser("hugo", "bistrot", (tx) =>
        rows<{ id: string }>(tx, "SELECT id FROM restaurants ORDER BY id"),
      )
    ).map((r) => r.id),
    ["bistrot"],
  );
  const site = await asUser("hugo", "bernay", (tx) =>
    rows(tx, "SELECT restaurant_id FROM site_documents"),
  );
  assert.equal(site.length, 0);
});
test("le nombre de structures suit les places de l’abonnement Studio de l’organisation", async () => {
  await assert.rejects(
    db.query("INSERT INTO restaurants(id,name,organization_id) VALUES('bistrot-2','Deuxième','bistrot-org')"),
    /Quota/,
  );
  await db.query("SELECT app.configure_organization_plan('bistrot-org',39,2)");
  await db.query("INSERT INTO restaurants(id,name,organization_id) VALUES('bistrot-2','Deuxième','bistrot-org')");
  assert.equal(
    (await rows<{ id: string }>(db as unknown as DB, "SELECT id FROM restaurants WHERE organization_id='bistrot-org'")).length,
    2,
  );
});
