import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { rows, type DB } from "../src/lib/database/db";
import { scope, type Actor } from "../src/lib/auth/session";
import { overview, platformPerform } from "../src/features/platform/service";
import { perform } from "../src/lib/actions";
import { snapshot } from "../src/lib/snapshot";
let db: PGlite;
const nadia: Actor = { id: "nadia", name: "Nadia", role: "OWNER" },
  hugo: Actor = { id: "hugo", name: "Hugo", role: "OWNER" },
  slimane: Actor = { id: "slimane", name: "Slimane", role: "SUPER_ADMIN" };
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
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
test("offre Essentiel : une seule structure, Premium : plusieurs", async () => {
  await assert.rejects(
    db.transaction(async (tx) =>
      perform(tx, "bistrot", await scope(tx, hugo, "bistrot"), {
        action: "addRestaurant",
        name: "Deuxième bistrot",
      }),
    ),
    /Premium/,
  );
  await assert.rejects(
    db.transaction((tx) =>
      platformPerform(tx, hugo, {
        action: "restaurant",
        organization: "bistrot-org",
        name: "Deuxième bistrot",
      }),
    ),
    /Premium/,
  );
  // Bypass attempt: a second organization owned by the same Essentiel account.
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.user_id','hugo',true)");
      await platformPerform(tx, hugo, {
        action: "onboard",
        organization: "Autre société de Hugo",
        restaurant: "Autre restaurant",
      });
    }),
    /Premium/,
  );
  // Nadia's organization is Premium: a further structure is accepted.
  await db.transaction(async (tx) =>
    perform(tx, "bernay", await scope(tx, nadia, "bernay"), {
      action: "addRestaurant",
      name: "Troisième adresse",
    }),
  );
  assert.equal(
    (
      await rows(
        db,
        "SELECT id FROM restaurants WHERE organization_id='legacy' AND name='Troisième adresse'",
      )
    ).length,
    1,
  );
  // Granting ownership of another customer's structure counts toward the quota.
  await assert.rejects(
    db.query("INSERT INTO memberships VALUES('hugo','atelier','OWNER')"),
    /Premium/,
  );
  await assert.rejects(
    db.query("INSERT INTO memberships VALUES('nadia','bistrot','SUPER_ADMIN')"),
    /Super Admin/,
  );
});
test("Super Admin plateforme : vue sur toutes les structures, seul à réinitialiser", async () => {
  const scoped = await scope(db, slimane, "bistrot");
  assert.equal(scoped.role, "SUPER_ADMIN");
  const all = await overview(db, slimane);
  assert.equal(all.platformAdmin, true);
  assert.ok(
    ["bernay", "atelier", "bistrot"].every((id) =>
      all.restaurants.some((r) => (r as { id: string }).id === id),
    ),
  );
  const mine = await overview(db, hugo);
  assert.equal(mine.platformAdmin, false);
  assert.deepEqual(
    mine.restaurants.map((r) => (r as { id: string }).id),
    ["bistrot"],
  );
  assert.equal(
    (
      await asUser("slimane", "bistrot", (tx) =>
        rows(tx, "SELECT id FROM restaurants WHERE id='bistrot'"),
      )
    ).length,
    1,
  );
  assert.equal(
    (
      await rows(
        db,
        "SELECT 1 FROM memberships WHERE profile_id='slimane' UNION ALL SELECT 1 FROM organization_memberships WHERE profile_id='slimane'",
      )
    ).length,
    0,
  );
});
