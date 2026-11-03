import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Database, DB } from "./types";
const migrations: [number, string][] = [
  [2, "002_catalog_promotions.sql"],
  [3, "003_floor_plan.sql"],
  [4, "004_commerce.sql"],
  [5, "005_platform.sql"],
  [6, "006_isolation.sql"],
  [7, "007_operations.sql"],
  [8, "008_loyalty_accounts.sql"],
  [9, "009_security.sql"],
  [10, "010_contracts.sql"],
  [11, "011_reconciliation.sql"],
  [12, "012_website_studio.sql"],
  [13, "013_operations_security.sql"],
  [14, "014_runtime_observability.sql"],
  [15, "015_security_references.sql"],
  [16, "016_security_worker_bootstrap.sql"],
  [17, "017_seo_primary_domain.sql"],
];
/** Applies every additive migration not yet recorded, inside the caller's transaction. */
export async function applyMigrations(tx: DB) {
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
export async function migrate(db: Database) {
  await db.transaction(applyMigrations);
}
