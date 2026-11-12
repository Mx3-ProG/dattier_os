import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { platformPerform } from "../src/features/platform/service";
import type { DB } from "../src/lib/database/db";
import { onboardingInput } from "./support/onboarding";
import { trialDays } from "../src/features/platform/promotion";

test("trial (3 days, 7 during Black Friday) grants access, expires, and cannot be restarted", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.query("INSERT INTO profiles(id,name,role,email) VALUES('trial-owner','Owner','OWNER','trial@example.test')");
    await db.exec("CREATE ROLE trial_app NOLOGIN; GRANT USAGE ON SCHEMA public,app TO trial_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO trial_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO trial_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO trial_app;");
    async function asOwner<T>(fn: (tx: DB) => Promise<T>) {
      return db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE trial_app");
        await tx.query("SELECT set_config('app.user_id','trial-owner',true)");
        return fn(tx);
      });
    }
    const created = await asOwner((tx) => platformPerform(tx, { id: "trial-owner", name: "Owner", role: "OWNER" }, {
      action: "onboard", organization: "Mon commerce", restaurant: "Ma boutique", ...onboardingInput(),
    }));
    const { organization, restaurant } = created as { organization: string; restaurant: string };
    assert.equal((await asOwner(async (tx) => (await tx.query<{ plan: number }>("SELECT app.restaurant_plan($1) AS plan", [restaurant])).rows[0].plan)), 39);
    const dates = (await db.query<{ days: number }>("SELECT extract(epoch FROM trial_ends_at-trial_started_at)/86400 AS days FROM app.organization_plans WHERE organization_id=$1", [organization])).rows[0];
    assert.equal(Number(dates.days), trialDays());
    await assert.rejects(asOwner((tx) => platformPerform(tx, { id: "trial-owner", name: "Owner", role: "OWNER" }, {
      action: "onboard", organization: "Encore", restaurant: "Autre boutique", ...onboardingInput(),
    })), /Essai déjà utilisé/);
    await asOwner((tx) => platformPerform(tx, { id: "trial-owner", name: "Owner", role: "OWNER" }, {
      action: "cancelSubscription", organization,
    }));
    assert.equal((await asOwner(async (tx) => (await tx.query<{ plan: number }>("SELECT app.restaurant_plan($1) AS plan", [restaurant])).rows[0].plan)), 0);
    const kept = (await db.query<{ days: number }>("SELECT extract(epoch FROM trial_ends_at-trial_started_at)/86400 AS days FROM app.organization_plans WHERE organization_id=$1", [organization])).rows[0];
    assert.equal(Number(kept.days), trialDays(), "cancelling keeps the granted trial length");
    await db.query("UPDATE app.organization_plans SET cancelled_at=NULL,trial_started_at=now()-interval '4 days',trial_ends_at=now()-interval '1 day' WHERE organization_id=$1", [organization]);
    assert.equal((await asOwner(async (tx) => (await tx.query<{ plan: number }>("SELECT app.restaurant_plan($1) AS plan", [restaurant])).rows[0].plan)), 0);
    await db.query("SELECT app.configure_organization_plan($1,39,1)", [organization]);
    assert.equal((await asOwner(async (tx) => (await tx.query<{ plan: number }>("SELECT app.restaurant_plan($1) AS plan", [restaurant])).rows[0].plan)), 39);
    await asOwner((tx) => platformPerform(tx, { id: "trial-owner", name: "Owner", role: "OWNER" }, {
      action: "cancelSubscription", organization,
    }));
    assert.equal((await asOwner(async (tx) => (await tx.query<{ plan: number }>("SELECT app.restaurant_plan($1) AS plan", [restaurant])).rows[0].plan)), 0);
  } finally {
    await db.close();
  }
});
