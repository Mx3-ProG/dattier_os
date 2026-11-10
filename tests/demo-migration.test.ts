import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("an older demo grant is retained when upgrading to the single plan", async () => {
  const db = new PGlite();
  try {
    const directory = "database/migrations";
    const files = (await readdir(directory))
      .filter((name) => /^\d{3}_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 74)
      .sort();
    for (const file of files) await db.exec(await readFile(`${directory}/${file}`, "utf8"));
    await db.query("SELECT app.configure_organization_plan('legacy',99,1)");
    await db.query("INSERT INTO restaurants(id,name,address,phone,goal) VALUES('old-demo','Ancienne démo','','',1000)");
    await db.exec("ALTER TABLE addon_legacy_grants DROP CONSTRAINT addon_legacy_grants_addon_id_check");
    await db.exec("ALTER TABLE addon_legacy_grants ADD CONSTRAINT addon_legacy_grants_addon_id_check CHECK (addon_id IN ('gamified-customers','loyalty'))");
    await db.query("INSERT INTO addon_legacy_grants(restaurant_id,addon_id) VALUES('old-demo','gamified-customers')");
    await db.exec(await readFile(`${directory}/075_single_plan.sql`, "utf8"));
    await db.exec(await readFile(`${directory}/076_three_day_trial.sql`, "utf8"));
    const grants = await db.query<{ addon_id: string }>(
      "SELECT addon_id FROM addon_legacy_grants WHERE restaurant_id='old-demo'",
    );
    assert.deepEqual(grants.rows, [{ addon_id: "loyalty" }]);
    assert.equal((await db.query<{ version: number }>("SELECT max(version) AS version FROM schema_versions")).rows[0].version, 76);
  } finally {
    await db.close();
  }
});
