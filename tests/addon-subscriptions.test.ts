import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { invoiceAccess, financeAccess } from "../src/features/invoices/service";

test("independent supplier invoices: persistent expiry, duplicate protection and role boundaries", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    await db.exec("UPDATE app.organization_plans SET plan=39");
    await db.query("DELETE FROM addon_legacy_grants WHERE restaurant_id IN ('bernay','atelier') AND addon_id='invoices'");
    const user = { id: "nadia", name: "Nadia", role: "OWNER" as const };
    await assert.rejects(invoiceAccess(db, "bernay", user), /forfait/);
    await db.query(
      "INSERT INTO addon_subscriptions(id,restaurant_id,addon,stripe_session) VALUES('purchase','bernay','invoices','cs_test')",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO addon_subscriptions(id,restaurant_id,addon) VALUES('duplicate','bernay','invoices')",
      ),
    );
    await db.query(
      "SELECT app.addon_reconcile('purchase','cs_test','sub_test','active',now()+interval '1 month')",
    );
    assert.equal((await invoiceAccess(db, "bernay", user)).id, "nadia");
    await db.query("SELECT app.addon_renewal('purchase','cs_test',true)");
    const scheduled = await db.query<{ renewal_cancelled: boolean }>(
      "SELECT renewal_cancelled FROM addon_subscriptions WHERE id='purchase'",
    );
    assert.equal(scheduled.rows[0].renewal_cancelled, true);
    assert.equal((await invoiceAccess(db, "bernay", user)).id, "nadia");
    await assert.rejects(
      db.query("SELECT app.addon_renewal('purchase','wrong_session',false)"),
      /introuvable/,
    );
    await migrate(db);

    // Finance is part of the single subscription, independently of the invoice add-on.
    await financeAccess(db, "bernay", user);
    await assert.rejects(
      invoiceAccess(db, "bernay", {
        id: "sarah",
        name: "Sarah",
        role: "WAITER",
      }),
      /refusé/,
    );
    const other = await db.query<{ allowed: boolean }>(
      "SELECT app.has_addon('atelier','invoices') AS allowed",
    );
    assert.equal(other.rows[0].allowed, false);
    await db.query(
      "SELECT app.addon_reconcile('purchase','cs_test','sub_test','active',now()-interval '1 minute')",
    );
    await assert.rejects(invoiceAccess(db, "bernay", user), /forfait/);
    await db.exec("SET ROLE atacuisine_app");
    await assert.rejects(
      db.query("SELECT app.addon_renewal('purchase','cs_test',false)"),
    );
    await db.query(
      "SELECT set_config('app.user_id','nadia',false),set_config('app.restaurant_id','atelier',false)",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO addon_subscriptions(id,restaurant_id,addon,renewal_cancelled) VALUES('forged','atelier','invoices',true)",
      ),
      /row-level security/,
    );

    await assert.rejects(
      db.query(
        "SELECT app.addon_reconcile('purchase','cs_test','sub_test','active',now()+interval '1 month')",
      ),
    );
    await assert.rejects(
      db.query("UPDATE addon_subscriptions SET status='active'"),
    );
  } finally {
    await db.close();
  }
});
