import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../src/lib/database/migrate";
import type { DB } from "../src/lib/database/types";

/**
 * Every RLS policy and service filters by business. A table carrying `restaurant_id`
 * without an index starting with it scans every tenant's rows on each read.
 */
test("every tenant table has an index led by restaurant_id", async () => {
  const db = new PGlite();
  try {
    await db.transaction(async (tx) => {
      await tx.exec(await readFile("database/migrations/001_core.sql", "utf8"));
      await applyMigrations(tx as unknown as DB);
    });
    const { rows } = await db.query<{ relname: string }>(`
      SELECT c.relname FROM pg_class c
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='restaurant_id' AND NOT a.attisdropped
      WHERE c.relkind='r' AND c.relnamespace='public'::regnamespace
        AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum)
      ORDER BY 1`);
    assert.deepEqual(rows.map((row) => row.relname), []);
    const rls = await db.query<{ missing: number }>(
      "SELECT count(*)::int AS missing FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace AND NOT relrowsecurity",
    );
    assert.equal(rls.rows[0].missing, 0);
  } finally {
    await db.close();
  }
});

test("migration 081 is registered and its rollback drops exactly its indexes", async () => {
  const files = await readdir("database/migrations");
  assert.ok(files.includes("081_tenant_indexes.sql"));
  const up = await readFile("database/migrations/081_tenant_indexes.sql", "utf8");
  const down = await readFile("database/migrations/down/081_tenant_indexes.sql", "utf8");
  const created = [...up.matchAll(/^CREATE INDEX IF NOT EXISTS (\w+)/gm)].map((m) => m[1]).sort();
  const dropped = [...down.matchAll(/^DROP INDEX IF EXISTS (\w+);/gm)].map((m) => m[1]).sort();
  assert.ok(created.length > 0);
  assert.deepEqual(dropped, created);
  assert.equal(new Set(created).size, created.length);
});
