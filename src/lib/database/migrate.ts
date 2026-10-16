import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite, Transaction } from "@electric-sql/pglite";
/**
 * Migrations additives, dans l’ordre. Chaque fichier enregistre lui-même sa
 * version dans `schema_versions` ; 001 est appliquée à la création de la base.
 * Ajouter une migration = ajouter une ligne ici, jamais modifier un fichier livré.
 */
export const migrations = [
  { version: 2, file: "002_catalog_promotions.sql" },
  { version: 3, file: "003_operations_notifications.sql" },
  { version: 4, file: "004_activity_categories.sql" },
] as const;
const done = new WeakSet<PGlite>();
/** Applique dans `tx` les migrations absentes de `schema_versions`. */
export async function applyMigrations(tx: PGlite | Transaction) {
  const applied = new Set(
    (
      await tx.query<{ version: number }>("SELECT version FROM schema_versions")
    ).rows.map((r) => r.version),
  );
  for (const m of migrations)
    if (!applied.has(m.version))
      await tx.exec(
        await readFile(
          path.join(process.cwd(), "database/migrations", m.file),
          "utf8",
        ),
      );
}
/** Additive migrations also run against an already-open development singleton. */
export async function migrate(db: PGlite) {
  if (done.has(db)) return;
  await db.transaction(applyMigrations);
  done.add(db);
}
