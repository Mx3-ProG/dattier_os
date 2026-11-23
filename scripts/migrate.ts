import { readFile } from "node:fs/promises";
import { PostgresDatabase } from "../src/infrastructure/database/postgres";
import { applyMigrations } from "../src/infrastructure/database/migrate";
const url = process.env.MIGRATION_DATABASE_URL;
if (!url)
  throw new Error(
    "MIGRATION_DATABASE_URL requis ; ne pas utiliser le rôle applicatif pour migrer.",
  );
const db = new PostgresDatabase(url);
try {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(742938201)");
    const exists = await tx.query<{ exists: boolean }>(
      "SELECT to_regclass('public.schema_versions') IS NOT NULL AS exists",
    );
    if (!exists.rows[0].exists)
      await tx.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await applyMigrations(tx);
  });
  console.log("Migrations appliquées sans données de démonstration.");
} finally {
  await db.close();
}
