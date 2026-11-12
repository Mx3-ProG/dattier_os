import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { platformPerform } from "../src/features/platform/service";
import type { DB } from "../src/lib/database/db";
import { onboardingInput } from "./support/onboarding";

test("abonnement Stripe : activation, impayé, résiliation, droits réservés au rôle de facturation", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.query("INSERT INTO profiles(id,name,role,email) VALUES('plan-owner','Owner','OWNER','plan@example.test'),('plan-staff','Staff','WAITER','staff@example.test')");
    await db.exec("CREATE ROLE plan_app NOLOGIN; GRANT atacuisine_app TO plan_app; GRANT USAGE ON SCHEMA public,app TO plan_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO plan_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO plan_app;");
    await db.exec("CREATE ROLE plan_billing NOLOGIN; GRANT atacuisine_addon_billing TO plan_billing;");
    const as = <T>(user: string, fn: (tx: DB) => Promise<T>) =>
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE plan_app");
        await tx.query("SELECT set_config('app.user_id',$1,true)", [user]);
        return fn(tx);
      });
    const billing = (sql: string, params: unknown[]) =>
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE plan_billing");
        await tx.query(sql, params);
      });
    const created = await as("plan-owner", (tx) => platformPerform(tx, { id: "plan-owner", name: "Owner", role: "OWNER" }, {
      action: "onboard", organization: "Abonné", restaurant: "Boutique", ...onboardingInput(),
    }));
    const { organization, restaurant } = created as { organization: string; restaurant: string };
    const plan = async () => (await as("plan-owner", (tx) => tx.query<{ plan: number }>("SELECT app.restaurant_plan($1) AS plan", [restaurant]))).rows[0].plan;
    const paid = async () => (await db.query<{ plan: number; cancelled_at: string | null }>("SELECT plan,cancelled_at FROM app.organization_plans WHERE organization_id=$1", [organization])).rows[0];

    // Owner records the Checkout session; a non-member cannot.
    await as("plan-owner", (tx) => tx.query("SELECT app.plan_record_session($1,'cs_test_abcdefgh123',NULL)", [organization]));
    await assert.rejects(as("plan-staff", (tx) => tx.query("SELECT app.plan_record_session($1,'cs_test_abcdefgh123',NULL)", [organization])), /propriétaire/);
    // The app role can never grant itself a paid plan.
    await assert.rejects(as("plan-owner", (tx) => tx.query("SELECT app.plan_reconcile($1,'cus_1','sub_1','active',now(),false,true)", [organization])), /permission denied/);

    const cardRequired = async () => (await as("plan-owner", (tx) => tx.query<{ required: boolean }>("SELECT app.restaurant_card_required($1) AS required", [restaurant]))).rows[0].required;
    // Trial without a registered card: the workspace waits for the card.
    assert.equal(await cardRequired(), true);
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_1','trialing',now()+interval '3 days',false,true)", [organization]);
    assert.equal(await cardRequired(), false);
    assert.equal((await paid()).plan, 39);
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_1','canceled',NULL,false,true)", [organization]);
    await db.query("UPDATE app.organization_plans SET cancelled_at=NULL WHERE organization_id=$1", [organization]);
    await db.query("DELETE FROM app.plan_subscriptions WHERE organization_id=$1", [organization]);
    // An incomplete first payment keeps the free trial untouched.
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_1','incomplete',NULL,false,true)", [organization]);
    assert.equal((await paid()).plan, 0);
    assert.equal(await plan(), 39);

    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_1','active',now()+interval '30 days',false,true)", [organization]);
    assert.equal((await paid()).plan, 39);
    const context = (await as("plan-owner", (tx) => tx.query<{ owner: boolean; status: string; stripe_customer: string }>("SELECT * FROM app.plan_billing_context($1)", [organization]))).rows[0];
    assert.deepEqual([context.owner, context.status, context.stripe_customer], [true, "active", "cus_1"]);

    // Past due keeps access while Stripe retries; a stale event of another subscription is ignored.
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_1','past_due',now()+interval '30 days',false,true)", [organization]);
    assert.equal((await paid()).plan, 39);
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_old','canceled',NULL,false,true)", [organization]);
    assert.equal((await paid()).plan, 39);

    // Final cancellation closes access, a new subscription reopens it.
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_1','canceled',NULL,false,true)", [organization]);
    assert.equal((await paid()).plan, 0);
    assert.ok((await paid()).cancelled_at);
    assert.equal(await plan(), 0);
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_2','active',now()+interval '30 days',false,true)", [organization]);
    assert.deepEqual([(await paid()).plan, (await paid()).cancelled_at], [39, null]);
    assert.equal(await plan(), 39);
    // Capacity is granted only by billing, for the current paid subscription.
    await assert.rejects(as("plan-owner",tx=>tx.query("SELECT app.plan_reconcile_details($1,'sub_2',5,NULL,NULL)",[organization])),/permission denied/);
    await billing("SELECT app.plan_reconcile_details($1,'sub_2',2,NULL,NULL)",[organization]);
    assert.equal((await db.query<{seats:number}>("SELECT seats FROM app.organization_plans WHERE organization_id=$1",[organization])).rows[0].seats,2);
    await billing("SELECT app.plan_reconcile_details($1,'sub_old',9,NULL,NULL)",[organization]);
    assert.equal((await db.query<{seats:number}>("SELECT seats FROM app.organization_plans WHERE organization_id=$1",[organization])).rows[0].seats,2);
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_2','past_due',now(),false,true)",[organization]);
    await billing("SELECT app.plan_reconcile_details($1,'sub_2',9,NULL,NULL)",[organization]);
    assert.equal((await db.query<{seats:number}>("SELECT seats FROM app.organization_plans WHERE organization_id=$1",[organization])).rows[0].seats,2);
    // Expired free owners get one reminder per ten hours; other users never get one.
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_2','canceled',NULL,false,true)",[organization]);
    await db.query("UPDATE app.organization_plans SET trial_started_at=now()-interval '8 days',trial_ends_at=now()-interval '1 day' WHERE organization_id=$1",[organization]);
    const claim=(user:string)=>as(user,async tx=>(await tx.query<{id:string|null}>("SELECT app.claim_billing_reminder() AS id")).rows[0].id);
    assert.equal(await claim("plan-staff"),null);
    assert.equal(await claim("plan-owner"),organization);
    assert.equal(await claim("plan-owner"),null);
    await db.exec("UPDATE app.billing_reminders SET shown_at=now()-interval '10 hours'");
    assert.equal(await claim("plan-owner"),organization);
    await billing("SELECT app.plan_reconcile($1,'cus_1','sub_3','trialing',now()+interval '7 days',false,true)",[organization]);
    await db.exec("UPDATE app.billing_reminders SET shown_at=now()-interval '11 hours'");
    assert.equal(await claim("plan-owner"),null);
  } finally {
    await db.close();
  }
});
