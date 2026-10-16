import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite, Transaction } from "@electric-sql/pglite";
const migrations: [number, string][] = [
  [2, "002_catalog_promotions.sql"],
  [3, "003_floor_plan.sql"],
];
/** Applies every additive migration not yet recorded, inside the caller's transaction. */
export async function applyMigrations(tx: PGlite | Transaction) {
  for (const [version, file] of migrations) {
    const { rows } = await tx.query<{ version: number }>(
      "SELECT version FROM schema_versions WHERE version=$1",
      [version],
    );
    if (!rows.length)
      await tx.exec(
        await readFile(
          path.join(process.cwd(), "database/migrations", file),
          "utf8",
        ),
      );
  }
}
/** Additive migrations also run against an already-open development singleton. */
export async function migrate(db: PGlite) {
  await db.transaction(applyMigrations);
}
