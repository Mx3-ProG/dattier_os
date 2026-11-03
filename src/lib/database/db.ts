import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { applyMigrations, migrate } from "./migrate";
import { seed } from "./seed";
import type { Database, DB } from "./types";
export type { DB } from "./types";
import { DemoDatabase } from "./demo";
import { PostgresDatabase } from "./postgres";
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
const globalDb = globalThis as unknown as { dattierDb?: Promise<Database> };
export function demoEnabled() {
  return process.env.DATTIER_DEMO === "true" && !process.env.VERCEL;
}
export function productionEnabled() {
  return process.env.DATTIER_DEMO !== "true" && !!process.env.DATABASE_URL;
}
export async function getDb(): Promise<Database> {
  if (productionEnabled()) {
    if (!globalDb.dattierDb)
      globalDb.dattierDb = (async () => {
        const db = new PostgresDatabase(process.env.DATABASE_URL!);
        const flags = await db.query<{ unsafe: boolean }>(
          "SELECT (rolsuper OR rolbypassrls OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER'))) AS unsafe FROM pg_roles WHERE rolname=current_user",
        );
        if (flags.rows[0]?.unsafe) {
          await db.close();
          throw new Error(
            "DATABASE_URL doit utiliser un rôle applicatif non propriétaire sans BYPASSRLS.",
          );
        }
        return db;
      })().catch((error) => {
        globalDb.dattierDb = undefined;
        throw error;
      });
    return globalDb.dattierDb;
  }
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
          await applyMigrations(tx);
          await seed(tx);
        });
      }
      return new DemoDatabase(db);
    })().catch((error) => {
      globalDb.dattierDb = undefined;
      throw error;
    });
  const db = await globalDb.dattierDb;
  await migrate(db);
  return db;
}
