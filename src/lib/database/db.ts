import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { migrate } from "./migrate";
import { seed } from "./seed";
export type DB = PGlite | Transaction;
export async function rows<T>(
  db: DB,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
export async function one<T>(
  db: DB,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const r = await rows<T>(db, sql, params);
  if (!r[0]) throw new Error("Élément introuvable dans cet établissement.");
  return r[0];
}
const globalDb = globalThis as unknown as { dattierDb?: Promise<PGlite> };
export function demoEnabled() {
  return process.env.DATTIER_DEMO === "true" && !process.env.VERCEL;
}
export async function getDb() {
  if (!demoEnabled())
    throw new Error(
      "Mode local désactivé. Configurer une authentification de production avant publication.",
    );
  if (!globalDb.dattierDb)
    globalDb.dattierDb = (async () => {
      const dir = process.env.DATTIER_DATA_DIR || ".data/dattier-demo";
      if (!dir.includes("demo"))
        throw new Error(
          "Le stockage doit être explicitement réservé à la démo.",
        );
      await mkdir(path.dirname(path.resolve(/* turbopackIgnore: true */ dir)), {
        recursive: true,
      });
      const db = new PGlite(path.resolve(/* turbopackIgnore: true */ dir));
      const exists = await rows<{ exists: boolean }>(
        db,
        "SELECT to_regclass('public.schema_versions') IS NOT NULL AS exists",
      );
      if (!exists[0].exists) {
        const migration = await readFile(
          path.join(process.cwd(), "database/migrations/001_core.sql"),
          "utf8",
        );
        await db.transaction(async (tx) => {
          await tx.exec(migration);
          await tx.exec(
            await readFile(
              path.join(
                process.cwd(),
                "database/migrations/002_catalog_promotions.sql",
              ),
              "utf8",
            ),
          );
          await seed(tx);
        });
      }
      return db;
    })().catch((error) => {
      globalDb.dattierDb = undefined;
      throw error;
    });
  const db = await globalDb.dattierDb;
  await migrate(db);
  return db;
}
