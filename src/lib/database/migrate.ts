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
  [18, "018_seo_platform_sites.sql"],
  [19, "019_seo_automation.sql"],
  [20, "020_organization_plans.sql"],
  [21, "021_product_pages.sql"],
  [22, "022_rebrand_roles.sql"],
  [23, "023_referrals.sql"],
  [24, "024_referral_rewards.sql"],
  [26, "026_ai_credits.sql"],
  [27, "027_customer_engagement.sql"],
  [28, "028_floor_architect.sql"],
  [29, "029_customer_messages.sql"],
  [30, "030_supplier_catalog.sql"],
  [31, "031_qr_codes.sql"],
  [32, "032_qr_scan_staff.sql"],
  [33, "033_profile_appearance.sql"],
  [34, "034_appearance_mode.sql"],
  [35, "035_appearance_accessibility.sql"],
  [36, "036_finance_core.sql"],
  [37, "037_online_payments.sql"],
  [38, "038_supplier_invoices.sql"],
  [39, "039_bank_reconciliation.sql"],
  [40, "040_hr_payroll.sql"],
  [41, "041_sales_invoices.sql"],
  [42, "042_finance_alignment.sql"],
  [43, "043_addon_subscriptions.sql"],
  [44, "044_pilotage_preferences.sql"],
  [45, "045_addon_renewal.sql"],
  [46, "046_fin_counter_isolation.sql"],
  [47, "047_module_settings.sql"],
  [48, "048_offline_tenant_references.sql"],
  [49, "049_addon_store.sql"],
  [50, "050_module_activation.sql"],
  [51, "051_studio_credits.sql"],
  [52, "052_plan_addon_renewal_guard.sql"],
  [60, "060_tenant_hardening.sql"],
  [61, "061_worker_groups.sql"],
  [62, "062_media_processing.sql"],
  [70, "070_analytics_engine.sql"],
  [71, "071_addon_installations.sql"],
  [72, "072_estimation.sql"],
  [73, "073_paid_feature_addons.sql"],
  [74, "074_paid_feature_access.sql"],
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
