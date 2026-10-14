import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
/** Additive migrations also run against an already-open development singleton. */
export async function migrate(db: PGlite) {
  const sql = await readFile(
    path.join(process.cwd(), "database/migrations/002_catalog_promotions.sql"),
    "utf8",
  );
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number }>(
      "SELECT version FROM schema_versions WHERE version=2",
    );
    if (!rows.length) await tx.exec(sql);
  });
}
