import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { platformPerform } from "../src/features/platform/service";
import { commerce } from "../src/features/commerce/service";
import { offlinePerform } from "../src/features/offline/service";
import { scope } from "../src/lib/auth/session";
import { can } from "../src/lib/permissions";
import { monthlyPrice } from "../src/features/platform/pricing";
import { requirePlan } from "../src/features/platform/entitlements";
import { randomUUID } from "node:crypto";
let db: PGlite;
const user = { id: "nadia", name: "Nadia", role: "OWNER" as const };
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  await db.exec(
    "CREATE ROLE tenant_app NOLOGIN; GRANT USAGE ON SCHEMA public,app TO tenant_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO tenant_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO tenant_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO tenant_app;",
  );
  await db.query(
    "INSERT INTO profiles(id,name,role,email) VALUES('other','Other','OWNER','other@example.test')",
  );
  await db.query("SELECT set_config('app.user_id','other',false)");
  await db.query(
    "SELECT app.bootstrap_organization('other-org','Autre groupe','other-r','Autre restaurant')",
  );
});
after(async () => {
  await db.close();
});
async function asUser<T>(id: string, r: string, fn: (tx: DB) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE tenant_app");
    await tx.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)",
      [id, r],
    );
    return fn(tx);
  });
}
test("RLS : refus croisé, absence de contexte et contraintes de références", async () => {
  assert.equal(
    (
      await asUser("nadia", "bernay", (tx) =>
        rows(tx, "SELECT id FROM restaurants WHERE id='other-r'"),
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await asUser("nadia", "other-r", (tx) =>
        rows(tx, "SELECT id FROM menu_items"),
      )
    ).length,
    0,
  );
  await assert.rejects(
    asUser("nadia", "bernay", (tx) =>
      tx.query(
        "INSERT INTO suppliers(id,restaurant_id,name) VALUES('evil','other-r','Cross')",
      ),
    ),
  );
  await assert.rejects(
    db.query(
      "INSERT INTO recipe_ingredients(menu_id,ingredient_id,quantity) VALUES('bernay-Plats-0','atelier-semoule',1)",
    ),
    /hors etablissement/,
  );
  assert.equal(
    (await asUser("nadia", "", (tx) => rows(tx, "SELECT id FROM orders")))
      .length,
    0,
  );
});
test("rôles cumulés et suspension vérifiés côté serveur", async () => {
  await db.query(
    "INSERT INTO memberships VALUES('karim','bernay','BARTENDER')",
  );
  const actor = await scope(
    db,
    { id: "karim", name: "Karim", role: "CHEF" },
    "bernay",
  );
  assert.equal(can(actor.roles!, "bar"), true);
  assert.equal(can(actor.roles!, "kitchen"), true);
  assert.equal(can(actor.roles!, "payments"), false);
  await db.query("UPDATE profiles SET status='suspended' WHERE id='other'");
  assert.equal(
    (
      await asUser("other", "other-r", (tx) =>
        rows(tx, "SELECT id FROM restaurants"),
      )
    ).length,
    0,
  );
  await db.query("UPDATE profiles SET status='active' WHERE id='other'");
});
test("initialisation multi-restaurant sans recopier les comptes et stocks de démo", async () => {
  const owner = { id: "other", name: "Other", role: "OWNER" } as const;
  const add = () =>
    asUser("other", "other-r", (tx) =>
      platformPerform(tx, owner, {
        action: "restaurant",
        organization: "other-org",
        name: "Deuxième restaurant",
      }),
    );
  await assert.rejects(add(), /avant activation/);
  await db.query("SELECT app.configure_organization_plan('other-org',39,1)");
  await assert.rejects(add(), /Quota/);
  await db.query("SELECT app.configure_organization_plan('other-org',39,2)");
  const result = (await asUser("other", "other-r", (tx) =>
    platformPerform(
      tx,
      { id: "other", name: "Other", role: "OWNER" },
      {
        action: "restaurant",
        organization: "other-org",
        name: "Deuxième restaurant",
      },
    ),
  )) as { restaurant: string };
  assert.ok(result.restaurant);
  await assert.rejects(add(), /Quota/);
  await assert.rejects(
    db.query("SELECT app.configure_organization_plan('other-org',69,2)"),
    /organization_plans_plan_check/,
  );
  for (const plan of [39] as const) {
    await db.query("SELECT app.configure_organization_plan('other-org',$1,2)", [
      plan,
    ]);
    assert.equal(monthlyPrice(plan, 2), plan + 39);
    for (const restaurant of ["other-r", result.restaurant]) {
      assert.equal(
        await asUser("other", restaurant, (tx) =>
          requirePlan(tx, restaurant, 39),
        ),
        plan,
      );
    }
  }
  await assert.rejects(
    db.query("SELECT app.configure_organization_plan('other-org',39,1)"),
    /Sélectionnez/,
  );
  await db.query(
    "SELECT app.configure_organization_plan('other-org',39,1,ARRAY[$1])",
    [result.restaurant],
  );
  await assert.rejects(
    asUser("other", result.restaurant, (tx) =>
      requirePlan(tx, result.restaurant, 39),
    ),
    /non autorisé/,
  );
  assert.equal(
    (
      await one<{ count: number }>(
        db,
        "SELECT count(*)::int AS count FROM shop_settings WHERE restaurant_id=$1",
        [result.restaurant],
      )
    ).count,
    1,
  );
  assert.equal(
    (
      await rows(db, "SELECT id FROM menu_items WHERE restaurant_id=$1", [
        result.restaurant,
      ])
    ).length,
    0,
  );
});
test("boutique : périmètre de suivi et configuration indépendante", async () => {
  await assert.rejects(commerce("other-r").receipt(db, "a".repeat(64)));
  assert.equal((await commerce("other-r").settings(db)).open, false);
  await commerce("bernay").updateSettings(db, user, {
    open: true,
    prepMinutes: 5,
    interval: 5,
    capacity: 10,
    hours: Array.from({ length: 7 }, (_, day) => ({
      day,
      open: "00:00",
      close: "23:59",
    })),
    categories: ["Plats", "Boissons", "Entrées", "Desserts"],
    address: "Test",
    phone: "",
    logo: "",
  });
  assert.equal((await commerce("other-r").settings(db)).open, false);
});
test("hors ligne : réservation, concurrence des quotas, rejeu et réconciliation", async () => {
  const r = (await db.transaction((tx) =>
    offlinePerform(tx, "bernay", user, {
      action: "register",
      name: "Tablette A",
    }),
  )) as { id: string };
  const before = await one<{ reserved: number }>(
    db,
    "SELECT reserved::float FROM stock_lots WHERE id='bernay-semoule-lot'",
  );
  const quota = (await db.transaction((tx) =>
    offlinePerform(tx, "bernay", user, {
      action: "allocate",
      device: r.id,
      menu: "bernay-Plats-0",
      quantity: 2,
    }),
  )) as { id: string };
  assert.equal(
    (
      await one<{ reserved: number }>(
        db,
        "SELECT reserved::float FROM stock_lots WHERE id='bernay-semoule-lot'",
      )
    ).reserved,
    before.reserved + 400,
  );
  const event = {
    id: randomUUID(),
    kind: "order",
    order: randomUUID(),
    items: [{ quota: quota.id, quantity: 1 }],
    at: new Date().toISOString(),
  };
  const sync = () =>
    db.transaction((tx) =>
      offlinePerform(tx, "bernay", user, {
        action: "sync",
        device: r.id,
        events: [event],
      }),
    );
  assert.equal(
    ((await sync()) as { results: { status: string }[] }).results[0].status,
    "applied",
  );
  assert.equal(
    ((await sync()) as { results: { status: string }[] }).results[0].status,
    "applied",
  );
  assert.equal(
    (await rows(db, "SELECT id FROM orders WHERE id=$1", [event.order])).length,
    1,
  );
  const over = {
    ...event,
    id: randomUUID(),
    order: randomUUID(),
    items: [{ quota: quota.id, quantity: 2 }],
  };
  assert.equal(
    (
      (await db.transaction((tx) =>
        offlinePerform(tx, "bernay", user, {
          action: "sync",
          device: r.id,
          events: [over],
        }),
      )) as { results: { status: string }[] }
    ).results[0].status,
    "conflict",
  );
  await db.transaction((tx) =>
    offlinePerform(tx, "bernay", user, { action: "reconcile", device: r.id }),
  );
  assert.equal(
    (
      await one<{ reserved: number }>(
        db,
        "SELECT reserved::float FROM stock_lots WHERE id='bernay-semoule-lot'",
      )
    ).reserved,
    before.reserved + 200,
  );
});

test("invitations : identité vérifiée, rôles cumulés et usage unique", async () => {
  const invite = (await asUser("nadia", "bernay", (tx) =>
    platformPerform(tx, user, {
      action: "invite",
      restaurant: "bernay",
      email: "other@example.test",
      roles: ["CHEF", "BARTENDER"],
    }),
  )) as { token: string };
  await asUser("other", "", (tx) =>
    platformPerform(
      tx,
      {
        id: "other",
        name: "Other",
        email: "other@example.test",
        role: "WAITER",
      },
      { action: "accept", token: invite.token },
    ),
  );
  const roles = await asUser("other", "bernay", (tx) =>
    rows<{ role: string }>(
      tx,
      "SELECT role FROM memberships WHERE profile_id='other' AND restaurant_id='bernay'",
    ),
  );
  assert.deepEqual(roles.map((r) => r.role).sort(), ["BARTENDER", "CHEF"]);
  await assert.rejects(
    asUser("other", "", (tx) =>
      platformPerform(
        tx,
        { id: "other", name: "Other", role: "WAITER" },
        { action: "accept", token: invite.token },
      ),
    ),
    /non autorisée/,
  );
  assert.equal(
    (
      await asUser("other", "atelier", (tx) =>
        rows(tx, "SELECT id FROM orders"),
      )
    ).length,
    0,
  );
});

test("parrainage : lien, récompenses, paliers, défi, classement et notifications", async () => {
  await db.query(
    "INSERT INTO profiles(id,name,role,email) VALUES('parrain','Parrain','OWNER','parrain@example.test')",
  );
  await db.query("SELECT set_config('app.user_id','parrain',false)");
  await db.query(
    "SELECT app.bootstrap_organization('parrain-org','Groupe parrain','parrain-r','Restaurant parrain')",
  );
  type Summary = {
    referral_code: string | null;
    referrals: { paying: boolean }[];
    paying_referrals: number;
    activated_total: number;
    activated_month: number;
    credits: number;
    rewards: { kind: string }[];
  };
  const summary = (org = "parrain-org", as = "parrain") =>
    asUser(as, "", (tx) =>
      one<Summary>(tx, "SELECT * FROM app.referral_summary($1)", [org]),
    );
  assert.equal((await summary()).referral_code, null, "pas de lien avant abonnement");
  await db.query("SELECT app.configure_organization_plan('parrain-org',39,1)");
  const { referral_code: code } = await summary();
  assert.match(code!, /^[A-F0-9]{10}$/);
  assert.equal(
    (await one<{ name: string }>(db, "SELECT app.referral_invitation($1) AS name", [code!.toLowerCase()])).name,
    "Groupe parrain",
  );
  // Self-referral and invalid codes are ignored without blocking onboarding.
  await asUser("parrain", "", (tx) =>
    platformPerform(tx, { id: "parrain", name: "Parrain", role: "OWNER" }, {
      action: "onboard", organization: "Moi-même", restaurant: "Annexe", referral: code,
    }),
  );
  assert.equal((await summary()).referrals.length, 0);
  const filleuls: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const id = `filleul-${i}`;
    await db.query(
      "INSERT INTO profiles(id,name,role,email) VALUES($1,$1,'OWNER',$2)",
      [id, `${id}@example.test`],
    );
    const created = (await asUser(id, "", (tx) =>
      platformPerform(tx, { id, name: id, role: "OWNER" }, {
        action: "onboard", organization: `Org ${i}`, restaurant: `Resto ${i}`, referral: code!.toLowerCase(),
      }),
    )) as { organization: string };
    filleuls.push(created.organization);
  }
  // The referred organisation gets its welcome month at sign-up.
  assert.equal(
    (await one<{ n: number }>(db, "SELECT count(*)::int AS n FROM app.referral_rewards WHERE organization_id=$1 AND key='welcome'", [filleuls[0]])).n,
    1,
  );
  let state = await summary();
  assert.equal(state.referrals.length, 5);
  assert.equal(state.paying_referrals, 0);
  assert.equal(state.credits, 0);
  const access = async () =>
    (await one<{ plan: number }>(db, "SELECT app.restaurant_plan('parrain-r') AS plan")).plan;
  await db.query("SELECT app.configure_organization_plan($1,39,1)", [filleuls[0]]);
  await db.query("SELECT app.configure_organization_plan($1,39,1)", [filleuls[1]]);
  state = await summary();
  assert.equal(state.credits, 3, "2 mois de parrainage + 1 mois du défi mensuel");
  assert.equal(state.rewards.filter((r) => r.kind === "challenge").length, 1);
  assert.equal(state.activated_month, 2);
  assert.equal(await access(), 39);
  await db.query("SELECT app.configure_organization_plan($1,39,1)", [filleuls[2]]);
  assert.equal(monthlyPrice(39, 1, 3), 0, "3 filleuls : forfait 39 € offert");
  await db.query("SELECT app.configure_organization_plan($1,39,1)", [filleuls[3]]);
  await db.query("SELECT app.configure_organization_plan($1,39,1)", [filleuls[4]]);
  state = await summary();
  assert.equal(state.paying_referrals, 5);
  assert.equal(state.activated_total, 5);
  assert.equal(state.credits, 6, "1 mois par filleul et un seul défi par mois");
  assert.equal(await access(), 39, "5 filleuls : aucune formule supérieure à débloquer");
  const notified = await one<{ n: number }>(
    db,
    "SELECT count(*)::int AS n FROM notifications WHERE restaurant_id='parrain-r' AND message LIKE 'Parrainage :%'",
  );
  assert.equal(notified.n, 5);
  // A referral that stops paying no longer counts; coming back grants nothing twice.
  await db.query("SELECT app.configure_organization_plan($1,0,1)", [filleuls[0]]);
  assert.equal((await summary()).paying_referrals, 4);
  assert.equal(await access(), 39);
  await db.query("SELECT app.configure_organization_plan($1,39,1)", [filleuls[0]]);
  assert.equal((await summary()).credits, 6);
  assert.equal(await access(), 39);
  // Leaderboard: anonymous by default, named once the referrer opts in.
  const board = (as: string, org: string) =>
    asUser(as, "", (tx) =>
      rows<{ name: string | null; referrals: number; is_me: boolean }>(
        tx,
        "SELECT * FROM app.referral_leaderboard($1)",
        [org],
      ),
    );
  const mine = await board("parrain", "parrain-org");
  assert.deepEqual(mine.find((r) => r.is_me), { rank: 1, name: "Groupe parrain", referrals: 5, is_me: true });
  assert.equal((await board("filleul-2", filleuls[1]))[0].name, null);
  await asUser("parrain", "", (tx) =>
    platformPerform(tx, { id: "parrain", name: "Parrain", role: "OWNER" }, {
      action: "referralVisibility", organization: "parrain-org", visible: true,
    }),
  );
  assert.equal((await board("filleul-2", filleuls[1]))[0].name, "Groupe parrain");
  // Another organisation cannot read the referrer's data.
  assert.equal(
    (await asUser("filleul-1", "", (tx) => rows(tx, "SELECT * FROM app.referral_summary('parrain-org')"))).length,
    0,
  );
  assert.equal((await board("filleul-1", "parrain-org")).length, 0);
});
