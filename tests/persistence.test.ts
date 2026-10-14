import { migrate } from "../src/lib/database/migrate";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { seed } from "../src/lib/database/seed";
import { one } from "../src/lib/database/db";
test("base persistante : fermeture puis réouverture indépendante", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dattier-demo-test-"));
  let db: PGlite | undefined;
  try {
    db = new PGlite(dir);
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    await db.query(
      "UPDATE restaurants SET name='Persistance vérifiée' WHERE id='bernay'",
    );
    await db.close();
    db = new PGlite(dir);
    assert.equal(
      (
        await one<{ name: string }>(
          db,
          "SELECT name FROM restaurants WHERE id='bernay'",
        )
      ).name,
      "Persistance vérifiée",
    );
    assert.equal(
      (
        await one<{ count: number }>(
          db,
          "SELECT count(*)::int AS count FROM menu_items",
        )
      ).count,
      76,
    );
  } finally {
    await db?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
