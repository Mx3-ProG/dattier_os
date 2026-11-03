/** Offline import only: source MUST be a cold, operator-created snapshot. Never point this at a live directory. */
import { PGlite } from "@electric-sql/pglite";
import { PostgresDatabase } from "../src/lib/database/postgres";
import { mkdtemp, cp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
const source = process.env.IMPORT_SNAPSHOT_DIR,
  url = process.env.MIGRATION_DATABASE_URL,
  owner = process.env.IMPORT_OWNER_ID;
if (!source || !url || !owner || process.env.CONFIRM_COLD_SNAPSHOT !== "true")
  throw new Error(
    "IMPORT_SNAPSHOT_DIR, MIGRATION_DATABASE_URL, IMPORT_OWNER_ID et CONFIRM_COLD_SNAPSHOT=true requis.",
  );
const copy = await mkdtemp(path.join(tmpdir(), "dattier-import-demo-"));
await cp(source, path.join(copy, "source"), {
  recursive: true,
  errorOnExist: true,
});
const local = new PGlite(path.join(copy, "source")),
  target = new PostgresDatabase(url);
const tables = [
  "restaurants",
  "profiles",
  "memberships",
  "dining_tables",
  "ingredients",
  "stock_lots",
  "menu_items",
  "recipe_ingredients",
  "table_sessions",
  "orders",
  "order_items",
  "stock_reservations",
  "stock_movements",
  "reservations",
  "suppliers",
  "purchase_orders",
  "receipts",
  "shifts",
  "time_entries",
  "expenses",
  "customers",
  "loyalty_transactions",
  "promo_codes",
  "payment_declarations",
  "notifications",
  "notification_reads",
  "audit_logs",
  "shop_orders",
  "promo_redemptions",
  "loyalty_rewards",
  "product_reviews",
  "shop_settings",
];
const excluded = [
  "sessions",
  "customer_sessions",
  "customer_password_resets",
  "customer_access_tokens",
  "customer_email_outbox",
  "platform_admins",
  "site_cms",
  "site_versions",
  "site_media",
  "security_events",
  "security_archives",
];
const report: Record<string, number> = {};
try {
  await target.transaction(async (tx) => {
    await tx.exec("SET LOCAL statement_timeout='0'");
    await tx.query("SELECT pg_advisory_xact_lock(742938201)");
    const existing = await tx.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM restaurants",
    );
    if (existing.rows[0].count)
      throw new Error(
        "La cible doit être vide de restaurants ; aucun écrasement autorisé.",
      );
    const verified = await tx.query(
      "SELECT id FROM profiles WHERE id=$1 AND status='active' AND id LIKE 'oidc:%'",
      [owner],
    );
    if (!verified.rows.length)
      throw new Error(
        "Le propriétaire doit se connecter via OIDC avant l’import.",
      );
    const organization = randomUUID();
    await tx.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
      organization,
      "Organisation importée",
    ]);
    await tx.query(
      "INSERT INTO organization_placements(organization_id) VALUES($1)",
      [organization],
    );
    await tx.query(
      "INSERT INTO organization_memberships VALUES($1,$2,'OWNER')",
      [organization, owner],
    );
    for (const table of tables) {
      const exists = await local.query<{ exists: boolean }>(
        "SELECT to_regclass($1) IS NOT NULL AS exists",
        ["public." + table],
      );
      if (!exists.rows[0].exists) continue;
      const records = (
        await local.query<Record<string, unknown>>(`SELECT * FROM "${table}"`)
      ).rows;
      const columns = (
        await tx.query<{ column_name: string; is_generated: string }>(
          "SELECT column_name,is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
          [table],
        )
      ).rows
        .filter((c) => c.is_generated === "NEVER")
        .map((c) => c.column_name);
      for (const record of records) {
        if (table === "restaurants") record.organization_id = organization;
        if (table === "profiles") {
          record.status = "suspended";
          record.email = "";
        }
        if (table === "customers") {
          delete record.password_hash;
          delete record.account_id;
        }
        const names = Object.keys(record).filter((k) => columns.includes(k));
        const values = names.map((k) =>
          record[k] !== null && typeof record[k] === "object"
            ? JSON.stringify(record[k])
            : record[k],
        );
        await tx.query(
          `INSERT INTO "${table}"(${names.map((n) => '"' + n + '"').join(",")}) OVERRIDING SYSTEM VALUE VALUES(${values.map((_, i) => "$" + (i + 1)).join(",")})${table === "shop_settings" ? " ON CONFLICT(restaurant_id) DO UPDATE SET config=excluded.config" : ""}`,
          values,
        );
      }
      report[table] = records.length;
    }
    await tx.query(
      "INSERT INTO memberships SELECT $1,id,'OWNER' FROM restaurants WHERE organization_id=$2 ON CONFLICT DO NOTHING",
      [owner, organization],
    );
    // A generated identity must continue above imported commerce order numbers.
    await tx.query(
      "SELECT setval(pg_get_serial_sequence('shop_orders','number'),coalesce(max(number),0)+1,false) FROM shop_orders",
    );
    // Reconcile persisted inventory invariants before committing anything.
    const invalid = await tx.query(
      "SELECT id FROM stock_lots WHERE reserved<0 OR quantity<reserved",
    );
    if (invalid.rows.length)
      throw new Error("Stock incohérent dans la source.");
  });
  console.log(
    JSON.stringify(
      {
        imported: report,
        excluded,
        notes: [
          "Profils historiques suspendus ; sessions et mots de passe exclus.",
          "CMS, archives et médias restent conservés dans le snapshot source ; conversion contrôlée requise.",
          "Propriétaire OIDC affecté à tous les établissements importés.",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await local.close();
  await target.close();
  await rm(copy, { recursive: true, force: true });
}
