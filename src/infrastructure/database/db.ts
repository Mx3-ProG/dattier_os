import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { applyMigrations, migrate } from "./migrate";
import { seed } from "./seed";
import type { Database, DB } from "./types";
export type { DB } from "./types";
import { DemoDatabase } from "./demo";
import { closeOnShutdown } from "./demo-shutdown";
import { grantDemoAddons } from "./demo-addons";
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
/** Refuse de démarrer si le rôle pourrait contourner la RLS : superutilisateur, BYPASSRLS ou propriétaire. */
export async function assertLeastPrivilege(db: PostgresDatabase, label: string) {
  const flags = await db.query<{ unsafe: boolean }>(
    "SELECT (rolsuper OR rolbypassrls OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER'))) AS unsafe FROM pg_roles WHERE rolname=current_user",
  );
  if (flags.rows[0]?.unsafe) {
    await db.close();
    throw new Error(
      `${label} doit utiliser un rôle applicatif non propriétaire sans BYPASSRLS.`,
    );
  }
}
const globalDb = globalThis as unknown as { atacuisineDb?: Promise<Database>; demoAddonGrantsVersion?: number };
/** Démo publique (ex. demo.studio-os.digital) : instantané chargé en mémoire, remis à zéro à chaque démarrage. */
export function publicDemoEnabled() {
  return (
    process.env.ATACUISINE_DEMO === "true" &&
    process.env.ATACUISINE_PUBLIC_DEMO === "true"
  );
}
export function demoEnabled() {
  return (
    process.env.ATACUISINE_DEMO === "true" &&
    (!process.env.VERCEL || publicDemoEnabled())
  );
}
export const DEMO_SNAPSHOT = "database/demo-snapshot/studio-demo.tar.gz";
async function openPublicDemo() {
  // Aucun fichier écrit : chaque instance repart de l’instantané, les modifications restent en mémoire.
  const snapshot = await readFile(path.join(process.cwd(), DEMO_SNAPSHOT));
  const db = new PGlite({ loadDataDir: new Blob([snapshot]) });
  await migrate(db);
  return new DemoDatabase(db);
}
export function productionEnabled() {
  return process.env.ATACUISINE_DEMO !== "true" && !!process.env.DATABASE_URL;
}
export async function getDb(): Promise<Database> {
  if (productionEnabled()) {
    if (!globalDb.atacuisineDb)
      globalDb.atacuisineDb = (async () => {
        const db = new PostgresDatabase(process.env.DATABASE_URL!);
        await assertLeastPrivilege(db, "DATABASE_URL");
        return db;
      })().catch((error) => {
        globalDb.atacuisineDb = undefined;
        throw error;
      });
    return globalDb.atacuisineDb;
  }
  if (!demoEnabled())
    throw new Error(
      "Mode local désactivé. Configurer une authentification de production avant publication.",
    );
  if (!globalDb.atacuisineDb && publicDemoEnabled())
    globalDb.atacuisineDb = openPublicDemo().catch((error) => {
      globalDb.atacuisineDb = undefined;
      throw error;
    });
  if (!globalDb.atacuisineDb)
    globalDb.atacuisineDb = (async () => {
      const dir = process.env.ATACUISINE_DATA_DIR || ".data/atacuisine-demo";
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
      } else await migrate(db);
      return new DemoDatabase(db);
    })().catch((error) => {
      globalDb.atacuisineDb = undefined;
      throw error;
    });
  const db = await globalDb.atacuisineDb;
  // Sans fermeture propre, la base peut ne plus redémarrer (voir demo-shutdown.ts).
  // Enregistré ici, une fois par processus, y compris dans un serveur déjà lancé.
  if (!publicDemoEnabled()) closeOnShutdown(() => db.close());
  await migrate(db);
  if (globalDb.demoAddonGrantsVersion !== 1) {
    await db.transaction(grantDemoAddons);
    globalDb.demoAddonGrantsVersion = 1;
  }
  return db;
}
