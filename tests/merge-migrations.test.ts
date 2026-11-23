import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";

for (const historical of ["crm", "offers"] as const) {
  test(`merge repairs the version 151 collision from the ${historical} branch without deleting profiles`, async () => {
    const db = new PGlite();
    try {
      await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
      await migrate(db);
      await db.exec("INSERT INTO profiles(id,name,role,email) VALUES('preserved','Preserved','OWNER','preserved@example.test')");
      // Reproduce either historical branch: version 151 recorded, one feature absent.
      await db.exec(historical === "crm"
        ? "DROP TABLE business_products,business_services CASCADE"
        : "DROP TABLE crm_checkout_followups CASCADE");
      await db.exec("DELETE FROM schema_versions WHERE version BETWEEN 185 AND 188");
      await migrate(db);
      await migrate(db);
      const { rows } = await db.query<{ crm: string; offers: string; profiles: number }>(
        "SELECT to_regclass('public.crm_checkout_followups')::text AS crm,to_regclass('public.business_services')::text AS offers,(SELECT count(*)::integer FROM profiles WHERE id='preserved') AS profiles",
      );
      assert.equal(rows[0].crm, "crm_checkout_followups");
      assert.equal(rows[0].offers, "business_services");
      assert.equal(rows[0].profiles, 1);
    } finally {
      await db.close();
    }
  });
}
