import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { one, rows, type DB } from "../src/infrastructure/database/db";
import { withDatabaseContext } from "../src/infrastructure/database/context";
import { changeItem, createOrder, pay } from "../src/features/orders/service";
import { perform, actionSchema } from "../src/application/actions";
import { financeAction, financeState } from "../src/features/finance/service";
import {
  financeDashboard,
  periodQuery,
  resolvePeriod,
} from "../src/features/finance/dashboard";
import {
  financeIntent,
  financeReply,
  periodIn,
  previousMonth,
} from "../src/features/assistant/finance";
import {
  financeTool,
  readFinanceTool,
  toolsFor,
} from "../src/features/assistant/llm";
import { euros } from "../src/domain/assistant/text";

const R = "bernay";
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
let db: PGlite;
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(),
  );
const dashboard = (
  query: Parameters<typeof financeDashboard>[3] = { period: "today" },
) => db.transaction((tx) => financeDashboard(tx, R, owner, query));
const asApp = <T>(
  userId: string,
  restaurant: string,
  fn: (tx: DB) => Promise<T>,
) =>
  withDatabaseContext({ userId, restaurantId: restaurant }, () =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)",
        [userId, restaurant],
      );
      return fn(tx);
    }),
  ) as Promise<T>;
async function sell(method: "cash" | "card" = "cash") {
  const dish = await one<{ id: string; price: number; cost: number }>(
    db,
    "SELECT m.id,m.price,(SELECT sum(r.quantity*i.cost)::float FROM recipe_ingredients r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.menu_id=m.id) AS cost FROM menu_items m WHERE m.restaurant_id=$1 AND m.enabled AND m.price>0 AND m.archived_at IS NULL AND EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id) AND NOT EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id AND coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=r.ingredient_id AND l.expires_on>=CURRENT_DATE),0)<r.quantity) ORDER BY m.id LIMIT 1",
    [R],
  );
  const table = await one<{ id: string }>(
    db,
    "SELECT id FROM dining_tables t WHERE restaurant_id=$1 AND status='free' AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.closed_at IS NULL) ORDER BY number LIMIT 1",
    [R],
  );
  const order = await db.transaction((tx) =>
    createOrder(
      tx,
      {
        restaurant: R,
        table: table.id,
        channel: "staff",
        customer: "",
        contact: "",
        key: randomUUID(),
        items: [{ menu: dish.id, quantity: 1, note: "" }],
      },
      owner,
    ),
  );
  const [line] = await rows<{ id: string }>(
    db,
    "SELECT id FROM order_items WHERE order_id=$1",
    [order],
  );
  for (const s of ["preparing", "ready", "served"])
    await db.transaction((tx) => changeItem(tx, R, line.id, s, owner));
  await db.transaction((tx) => pay(tx, R, order, method, owner));
  await db.query("UPDATE dining_tables SET status='free' WHERE id=$1", [
    table.id,
  ]);
  return dish;
}

before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  await db.transaction((tx) => financeState(tx, R, owner));
});
after(() => db.close());

test("périodes : semaine du lundi, mois, année, jours de Paris", () => {
  const now = new Date("2026-11-11T23:30:00Z"); // déjà le 12 à Paris
  assert.deepEqual(resolvePeriod({ period: "today" }, now), {
    period: "today",
    from: "2026-11-12",
    to: "2026-11-12",
  });
  assert.equal(resolvePeriod({ period: "week" }, now).from, "2026-11-09");
  assert.equal(resolvePeriod({ period: "month" }, now).from, "2026-11-01");
  assert.equal(resolvePeriod({ period: "year" }, now).from, "2026-01-01");
  assert.equal(
    periodQuery.safeParse({
      period: "custom",
      from: "2026-02-01",
      to: "2026-01-01",
    }).success,
    false,
  );
  assert.equal(periodQuery.safeParse({ period: "custom" }).success, false);
  assert.equal(
    periodQuery.safeParse({
      period: "custom",
      from: "2010-01-01",
      to: "2026-01-01",
    }).success,
    false,
  );
  assert.deepEqual(previousMonth(new Date("2026-03-15T12:00:00Z")), {
    period: "custom",
    from: "2026-02-01",
    to: "2026-02-28",
  });
});

test("sans régime de TVA : encaissements exacts, chiffre d’affaires non disponible", async () => {
  const before = (await dashboard()).metrics.cash.value!;
  const dish = await sell();
  const d = await dashboard();
  assert.equal(d.metrics.cash.value, before + dish.price);
  assert.equal(d.metrics.cash.status, "confirmed");
  assert.equal(d.metrics.revenue.value, null);
  assert.equal(d.metrics.revenue.status, "missing");
  assert.equal(d.metrics.margin.value, null);
  assert.equal(d.daily.at(-1)?.day, today());
});

test("les chiffres sans source restent vides, jamais à zéro", async () => {
  const { metrics: m } = await dashboard();
  for (const metric of [
    m.treasury,
    m.vatDeductible,
    m.unpaidInvoices,
    m.staffCost,
    m.supplierCost,
    m.accountingResult,
  ]) {
    assert.equal(metric.value, null);
    assert.equal(metric.status, "missing");
    assert.ok(metric.note.length > 10);
  }
});

test("TVA déclarée : ventes partiellement couvertes, puis chiffres complets", async () => {
  const view = await db.transaction((tx) => financeState(tx, R, owner));
  const act = (a: Parameters<typeof financeAction>[3]) =>
    db.transaction((tx) => financeAction(tx, R, owner, a));
  const s = view.settings;
  await act({
    action: "settings",
    vatRegime: "normal",
    cashAccount: s.cash_account,
    cardAccount: s.card_account,
    otherAccount: s.other_account,
    salesAccount: s.sales_account,
  });
  const ten = (view.rates as { id: string; rate_bp: number }[]).find(
    (r) => r.rate_bp === 1000,
  )!;
  for (const c of view.categories as { category: string }[])
    await act({
      action: "categoryVat",
      category: c.category,
      onsite: ten.id,
      takeaway: ten.id,
    });
  const partial = await dashboard();
  assert.equal(partial.metrics.revenue.status, "partial");
  assert.match(partial.metrics.revenue.note, /à vérifier/);
  assert.equal(partial.metrics.margin.value, null);
  await act({ action: "applyConfigured" });
  const dish = await sell("card");
  const d = await dashboard();
  assert.equal(d.metrics.revenue.status, "confirmed");
  assert.ok(d.metrics.revenue.value! > 0);
  assert.equal(
    d.metrics.vatCollected.value! + d.metrics.revenue.value!,
    d.metrics.cash.value!,
  );
  assert.equal(d.metrics.materialCost.status, "estimate");
  assert.equal(d.metrics.margin.status, "estimate");
  assert.equal(
    d.metrics.margin.value,
    d.metrics.revenue.value! - d.metrics.materialCost.value!,
  );
  assert.ok(d.metrics.materialCost.value! >= Math.round(dish.cost * 100));
  assert.ok(d.byMethod.some((b) => b.method === "card"));
  assert.ok(d.averageTicket! > 0);
});

test("dépenses et résultat avant personnel suivent la même période", async () => {
  const before = await dashboard();
  await db.transaction((tx) =>
    perform(
      tx,
      R,
      owner,
      actionSchema.parse({ action: "expense", label: "Essai", amount: 1234 }),
    ),
  );
  const after = await dashboard();
  assert.equal(
    after.metrics.expenses.value,
    before.metrics.expenses.value! + 1234,
  );
  assert.equal(
    after.metrics.resultBeforeStaff.value,
    before.metrics.resultBeforeStaff.value! - 1234,
  );
  const old = await dashboard({
    period: "custom",
    from: "2001-01-01",
    to: "2001-12-31",
  });
  assert.equal(old.metrics.cash.value, 0);
  assert.equal(old.metrics.expenses.value, 0);
  assert.equal(old.averageTicket, null);
});

test("droits : salle refusée, autre établissement invisible, sous le rôle applicatif", async () => {
  await assert.rejects(
    asApp("sarah", R, (tx) =>
      financeDashboard(tx, R, waiter, { period: "month" }),
    ),
    /refusé/,
  );
  assert.ok(
    (
      await asApp("nadia", R, (tx) =>
        financeDashboard(tx, R, owner, { period: "year" }),
      )
    ).metrics.cash.value! > 0,
  );
  await db.query(
    "INSERT INTO profiles(id,name,role,email) VALUES('dash-other','Autre','OWNER','autre@example.test') ON CONFLICT DO NOTHING",
  );
  await db.query("SELECT set_config('app.user_id','dash-other',false)");
  await db.query(
    "SELECT app.bootstrap_organization('dash-org','Autre','dash-r','Autre')",
  );
  await db.query("SELECT set_config('app.user_id','',false)");
  const other = { id: "dash-other", name: "Autre", role: "OWNER" as const };
  await assert.rejects(
    asApp("dash-other", R, (tx) =>
      financeDashboard(tx, R, other, { period: "year" }),
    ),
    /autorisé/,
  );
});

test("assistant : reconnaît les questions du cahier des charges, sans capter les ordres", () => {
  const cases: [string, string][] = [
    ["Combien avons-nous encaissé aujourd’hui ?", "cash"],
    ["Quel est notre chiffre d’affaires du mois ?", "revenue"],
    ["Quels fournisseurs coûtent le plus cher ?", "suppliers"],
    ["Quelles factures restent impayées ?", "invoices"],
    ["Quel est notre coût de personnel cette semaine ?", "staff"],
    ["Pourquoi notre marge a-t-elle diminué ?", "marginTrend"],
    ["Combien avons-nous dépensé en marchandises ?", "merchandise"],
    ["Quel est notre bénéfice prévisionnel ?", "profit"],
  ];
  for (const [question, intent] of cases)
    assert.equal(financeIntent(question), intent, question);
  for (const order of [
    "Encaisse la table 2 en espèces",
    "Ajoute une dépense de 20 euros",
    "Ajoute le fournisseur Verger Bio",
    "Chiffre du jour",
    "ouvre les dépenses",
  ])
    assert.equal(financeIntent(order), null, order);
  assert.deepEqual(periodIn("coût de personnel cette semaine", "staff"), {
    period: "week",
  });
  assert.deepEqual(periodIn("combien encaissé", "cash"), { period: "today" });
});

test("assistant : réponses tirées des vraies données, chiffres absents annoncés", async () => {
  const d = await dashboard({ period: "month" });
  assert.match(financeReply("cash", d), /Encaissé ce mois-ci/);
  assert.ok(financeReply("cash", d).includes(euros(d.metrics.cash.value!)));
  for (const intent of ["staff", "suppliers", "invoices"] as const) {
    const reply = financeReply(intent, d);
    assert.match(reply, /je ne peux pas encore le dire/);
    assert.doesNotMatch(reply, /€/);
  }
  assert.match(financeReply("margin", d), /estimation/);
  assert.match(financeReply("profit", d), /bénéfice réel reste inconnu/);
  const previous = await dashboard(previousMonth());
  assert.match(financeReply("marginTrend", d, previous), /pas sa cause/);
});

test("outil IA : réservé à la finance, lecture seule, erreurs sans détail", async () => {
  assert.ok(toolsFor({ permissions: ["finance"] }).includes(readFinanceTool));
  assert.ok(!toolsFor({ permissions: ["orders"] }).includes(readFinanceTool));
  assert.equal(readFinanceTool.input_schema.required?.includes("period"), true);
  let received: unknown;
  const ok = await financeTool(
    { input: { period: "custom", from: "2026-01-01", to: "2026-01-31" } },
    async (q) => {
      received = q;
      return { metrics: {} };
    },
  );
  assert.equal(ok.error, false);
  assert.deepEqual(received, {
    period: "custom",
    from: "2026-01-01",
    to: "2026-01-31",
  });
  const refused = await financeTool(
    { input: { period: "month", from: "", to: "" } },
    async () => {
      throw new Error("Accès refusé SELECT secret");
    },
  );
  assert.equal(refused.error, true);
  assert.doesNotMatch(refused.content, /SELECT/);
  assert.equal((await financeTool({ input: {} })).error, true);
});
