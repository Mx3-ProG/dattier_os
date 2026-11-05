import { readFile } from "node:fs/promises";
import { PostgresDatabase } from "../src/lib/database/postgres";
import { applyMigrations } from "../src/lib/database/migrate";
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
  // Explicit least-privilege role. Password is provisioned separately, never interpolated.
  await db.exec(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='dattier_app') THEN CREATE ROLE dattier_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$;
 GRANT USAGE ON SCHEMA public,app TO dattier_app;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO dattier_app;
 REVOKE ALL ON schema_versions FROM dattier_app;
 GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO dattier_app;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dattier_app;
 REVOKE EXECUTE ON FUNCTION app.claim_jobs(text),app.configure_organization_plan(text,integer,integer,text[]) FROM dattier_app;
 DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='dattier_worker') THEN CREATE ROLE dattier_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$;
 GRANT dattier_app TO dattier_worker;
 GRANT EXECUTE ON FUNCTION app.claim_jobs(text) TO dattier_worker;
 REVOKE EXECUTE ON FUNCTION app.ensure_profile(text,text,text),app.bootstrap_organization(text,text,text,text),app.accept_invitation(text),app.consume_rate_limit(text,integer,integer),app.resolve_domain(text) FROM PUBLIC;`);
  console.log("Migrations appliquées sans données de démonstration.");
} finally {
  await db.close();
}
