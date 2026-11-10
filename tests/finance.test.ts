import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { withDatabaseContext } from "../src/lib/database/context";
import { changeItem, createOrder, pay } from "../src/features/orders/service";
import { commerce } from "../src/features/commerce/service";
import { processPayment } from "../src/features/finance/books";
import {
  financeAction,
  financeActionSchema,
  financeState,
} from "../src/features/finance/service";
import {
  allocate,
  saleEntryLines,
  splitVat,
} from "../src/features/finance/posting";

const R = "bernay";
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
let db: PGlite;

/** Exécute comme l’application en production : rôle sans privilège, RLS active. */
const asApp = <T>(
  userId: string,
  restaurant: string,
  fn: (tx: DB) => Promise<T>,
  isPublic = false,
) =>
  withDatabaseContext({ userId, restaurantId: restaurant }, () =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true)",
        [userId, restaurant, String(isPublic)],
      );
      return fn(tx);
    }),
  ) as Promise<T>;

const dishes = async (count = 2) =>
  rows<{ id: string; name: string; price: number }>(
    db,
    "SELECT m.id,m.name,m.price FROM menu_items m WHERE m.restaurant_id=$1 AND m.enabled AND m.archived_at IS NULL AND EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id) AND m.price>0 ORDER BY m.id LIMIT $2",
    [R, count],
  );
const freeTable = async () =>
  (
    await one<{ id: string }>(
      db,
      "SELECT id FROM dining_tables t WHERE restaurant_id=$1 AND status='free' AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.closed_at IS NULL) ORDER BY number LIMIT 1",
      [R],
    )
  ).id;

/** Commande de salle servie et réglée, de bout en bout, par les vrais services. */
async function servedAndPaid(items: { menu: string; quantity: number }[]) {
  const table = await freeTable();
  const order = await db.transaction((tx) =>
    createOrder(
      tx,
      {
        restaurant: R,
        table,
        channel: "staff",
        customer: "",
        contact: "",
        key: randomUUID(),
        items: items.map((i) => ({ ...i, note: "" })),
      },
      owner,
    ),
  );
  const lines = await rows<{ id: string }>(
    db,
    "SELECT id FROM order_items WHERE order_id=$1",
    [order],
  );
  for (const line of lines)
    for (const status of ["preparing", "ready", "served"])
      await db.transaction((tx) => changeItem(tx, R, line.id, status, owner));
  await db.transaction((tx) => pay(tx, R, order, "cash", owner));
  await db.query("UPDATE dining_tables SET status='free' WHERE id=$1", [table]);
  const session = await one<{ session_id: string }>(
    db,
    "SELECT session_id FROM orders WHERE id=$1",
    [order],
  );
  const declaration = await one<{ id: string; amount: number }>(
    db,
    "SELECT id,amount FROM payment_declarations WHERE session_id=$1",
    [session.session_id],
  );
  return { order, declaration };
}
const entriesFor = (declaration: string) =>
  rows<{ id: string; kind: string; revision: number }>(
    db,
    "SELECT n.id,n.kind,n.revision FROM fin_entries n JOIN fin_events e ON e.id=n.event_id WHERE e.dedupe_key=$1 ORDER BY n.number",
    [`payment:${declaration}`],
  );
/** Même chemin que la route : validation du corps, puis action. */
const act = async (a: Parameters<typeof financeAction>[3]) => {
  const parsed = financeActionSchema.parse(a);
  return db.transaction((tx) => financeAction(tx, R, owner, parsed));
};
const state = () => db.transaction((tx) => financeState(tx, R, owner));

before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(() => db.close());

test("calcul : répartition sans perte de centime et TVA recomposant le TTC", () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(
    allocate(999, [333, 77, 1]).reduce((s, x) => s + x, 0),
    999,
  );
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(splitVat(1100, 1000), { net: 1000, vat: 100 });
  for (let gross = 1; gross < 2000; gross += 37) {
    const { net, vat } = splitVat(gross, 550);
    assert.equal(net + vat, gross);
  }
});

test("calcul : écriture équilibrée, ventilée par taux, remise répartie", () => {
  const line = (rateId: string, rateBp: number, gross: number) => ({
    gross,
    rateId,
    rateBp,
    salesAccount: `7${rateBp}`,
    vatAccount: `4${rateBp}`,
  });
  const lines = saleEntryLines(
    [line("a", 1000, 1100), line("b", 2000, 1200), line("a", 1000, 2200)],
    450,
    "530",
  );
  const debit = lines.reduce((s, l) => s + l.debit, 0),
    credit = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debit, 4500 - 450);
  assert.equal(credit, debit);
  assert.equal(lines[0].account, "530");
  // Un taux à 0 % ne produit pas de ligne de TVA à zéro.
  const exempt = saleEntryLines([line("z", 0, 500)], 0, "530");
  assert.equal(exempt.length, 2);
});

test("sans TVA connue, le règlement aboutit mais ne crée aucune écriture", async () => {
  const [dish] = await dishes(1);
  const { declaration } = await servedAndPaid([{ menu: dish.id, quantity: 1 }]);
  assert.equal(declaration.amount, dish.price);
  assert.equal((await entriesFor(declaration.id)).length, 0);
  const view = await state();
  assert.equal(view.settings.vat_regime, "unknown");
  assert.ok(view.counts.open >= 1);
  assert.ok(
    view.review.some(
      (r) => r.source_id === declaration.id && r.kind === "vat_undetermined",
    ),
  );
  // Les taux légaux sont proposés, mais aucun produit n’en reçoit un d’office.
  assert.equal(view.rates.length, 3);
  assert.ok(
    view.products.every(
      (p) => !(p as { onsite_rate_id: unknown }).onsite_rate_id,
    ),
  );
});

test("l’historique reste à vérifier et n’est jamais comptabilisé d’office", async () => {
  const view = await state();
  assert.equal(
    (
      await one<{ count: number }>(
        db,
        "SELECT count(*)::int AS count FROM fin_events WHERE dedupe_key LIKE 'payment:%' AND restaurant_id=$1",
        [R],
      )
    ).count >= view.counts.open,
    true,
  );
  assert.equal(view.counts.entries, 0);
});

test("TVA configurée : écriture équilibrée, numérotée et rejouable sans doublon", async () => {
  const view = await state();
  const ten = view.rates.find(
    (r) => (r as { rate_bp: number }).rate_bp === 1000,
  ) as { id: string };
  const twenty = view.rates.find(
    (r) => (r as { rate_bp: number }).rate_bp === 2000,
  ) as { id: string };
  const s = view.settings;
  await act({
    action: "settings",
    vatRegime: "normal",
    cashAccount: s.cash_account,
    cardAccount: s.card_account,
    otherAccount: s.other_account,
    salesAccount: s.sales_account,
  });
  const [a, b] = await dishes(2);
  await act({
    action: "productVat",
    menu: a.id,
    onsite: ten.id,
    takeaway: ten.id,
  });
  await act({
    action: "productVat",
    menu: b.id,
    onsite: twenty.id,
    takeaway: twenty.id,
  });
  const { declaration } = await servedAndPaid([
    { menu: a.id, quantity: 2 },
    { menu: b.id, quantity: 1 },
  ]);
  const [entry] = await entriesFor(declaration.id);
  assert.ok(entry, "le règlement a son écriture");
  const lines = await rows<{
    account_code: string;
    debit: number;
    credit: number;
  }>(
    db,
    "SELECT account_code,debit,credit FROM fin_entry_lines WHERE entry_id=$1 ORDER BY line_no",
    [entry.id],
  );
  const sum = (k: "debit" | "credit") =>
    lines.reduce((t, l) => t + Number(l[k]), 0);
  assert.equal(sum("debit"), declaration.amount);
  assert.equal(sum("credit"), declaration.amount);
  assert.equal(lines[0].account_code, "530");
  assert.ok(lines.some((l) => l.account_code === "445711"));
  assert.ok(lines.some((l) => l.account_code === "445712"));
  // Rejouer le traitement, même plusieurs fois, ne crée jamais une seconde écriture.
  await db.transaction((tx) => processPayment(tx, R, declaration.id));
  await db.transaction((tx) => processPayment(tx, R, declaration.id));
  assert.equal((await entriesFor(declaration.id)).length, 1);
});

test("un taux figé sur la ligne ne change pas si le produit change ensuite", async () => {
  const view = await state();
  const rate = (bp: number) =>
    (
      view.rates.find((r) => (r as { rate_bp: number }).rate_bp === bp) as {
        id: string;
      }
    ).id;
  const [dish] = await dishes(1);
  await act({
    action: "productVat",
    menu: dish.id,
    onsite: rate(1000),
    takeaway: rate(1000),
  });
  const { order } = await servedAndPaid([{ menu: dish.id, quantity: 1 }]);
  await act({
    action: "productVat",
    menu: dish.id,
    onsite: rate(2000),
    takeaway: rate(2000),
  });
  const line = await one<{ vat_rate_bp: number }>(
    db,
    "SELECT vat_rate_bp FROM order_items WHERE order_id=$1",
    [order],
  );
  assert.equal(line.vat_rate_bp, 1000);
  await act({
    action: "productVat",
    menu: dish.id,
    onsite: rate(1000),
    takeaway: rate(1000),
  });
});

test("opération à vérifier : l’utilisateur précise le taux, puis l’écriture part", async () => {
  const [, second] = await dishes(2);
  const view = await state();
  const rate = (
    view.rates.find((r) => (r as { rate_bp: number }).rate_bp === 1000) as {
      id: string;
    }
  ).id;
  await act({
    action: "productVat",
    menu: second.id,
    onsite: null,
    takeaway: null,
  });
  const { declaration } = await servedAndPaid([
    { menu: second.id, quantity: 1 },
  ]);
  assert.equal((await entriesFor(declaration.id)).length, 0);
  const item = (await state()).review.find(
    (r) => r.source_id === declaration.id,
  );
  assert.ok(item);
  assert.match(item.message, /Taux de TVA à préciser/);
  // Une ligne d’une autre opération est refusée.
  await assert.rejects(
    act({
      action: "resolve",
      id: item.id,
      assignments: [{ item: "autre", rate }],
    }),
    /n’appartient pas/,
  );
  const result = await act({
    action: "resolve",
    id: item.id,
    assignments: item.items.map((l) => ({ item: l.id, rate })),
  });
  assert.deepEqual(result, { outcome: "posted" });
  assert.equal((await entriesFor(declaration.id)).length, 1);
  await act({
    action: "productVat",
    menu: second.id,
    onsite: rate,
    takeaway: rate,
  });
});

test("contre-passation : l’écriture reste, l’opération revient à vérifier, puis repart", async () => {
  const [dish] = await dishes(1);
  const { declaration } = await servedAndPaid([{ menu: dish.id, quantity: 1 }]);
  const [origin] = await entriesFor(declaration.id);
  await assert.rejects(
    act({ action: "reverse", id: origin.id, reason: "court" }),
  );
  await act({
    action: "reverse",
    id: origin.id,
    reason: "Taux de TVA erroné sur cette vente",
  });
  await assert.rejects(
    act({
      action: "reverse",
      id: origin.id,
      reason: "Taux de TVA erroné sur cette vente",
    }),
    /déjà/,
  );
  const history = await entriesFor(declaration.id);
  assert.deepEqual(
    history.map((e) => e.kind),
    ["sale_payment", "reversal"],
  );
  const view = await state();
  const item = view.review.find((r) => r.source_id === declaration.id);
  assert.equal(item?.kind, "correction");
  const rate = (
    view.rates.find((r) => (r as { rate_bp: number }).rate_bp === 2000) as {
      id: string;
    }
  ).id;
  await act({
    action: "resolve",
    id: item!.id,
    assignments: item!.items.map((l) => ({ item: l.id, rate })),
  });
  const after = await entriesFor(declaration.id);
  assert.deepEqual(
    after.map((e) => [e.kind, e.revision]),
    [
      ["sale_payment", 0],
      ["reversal", 0],
      ["sale_payment", 1],
    ],
  );
});

test("franchise en base : pas de TVA, et chaîne du journal intègre", async () => {
  const s = (await state()).settings;
  await act({
    action: "settings",
    vatRegime: "franchise",
    cashAccount: s.cash_account,
    cardAccount: s.card_account,
    otherAccount: s.other_account,
    salesAccount: s.sales_account,
  });
  const [dish] = await dishes(1);
  const { declaration } = await servedAndPaid([{ menu: dish.id, quantity: 1 }]);
  // Déclarer la franchise ne comptabilise pas d’office les ventes passées en attente.
  assert.ok((await state()).counts.open > 0);
  const [entry] = await entriesFor(declaration.id);
  const lines = await rows<{ account_code: string }>(
    db,
    "SELECT account_code FROM fin_entry_lines WHERE entry_id=$1 ORDER BY line_no",
    [entry.id],
  );
  assert.deepEqual(
    lines.map((l) => l.account_code),
    ["530", "707"],
  );
  await act({
    action: "settings",
    vatRegime: "normal",
    cashAccount: s.cash_account,
    cardAccount: s.card_account,
    otherAccount: s.other_account,
    salesAccount: s.sales_account,
  });
  const check = await act({ action: "verify" });
  assert.equal(check.chain?.broken_at, null);
  assert.ok((check.chain?.checked ?? 0) >= 5);
});

test("intégrité : écritures et règlements ne se modifient ni ne se suppriment", async () => {
  const entry = await one<{ id: string }>(
    db,
    "SELECT id FROM fin_entries LIMIT 1",
  );
  await assert.rejects(
    db.query("UPDATE fin_entries SET label='x' WHERE id=$1", [entry.id]),
    /ajout seul/,
  );
  await assert.rejects(
    db.query("DELETE FROM fin_entry_lines WHERE entry_id=$1", [entry.id]),
    /ajout seul/,
  );
  await assert.rejects(
    db.query("UPDATE fin_events SET amount=1"),
    /ajout seul/,
  );
  await assert.rejects(
    db.query("UPDATE payment_declarations SET amount=1"),
    /ajout seul/,
  );
  await assert.rejects(
    db.query("DELETE FROM payment_declarations"),
    /ajout seul/,
  );
});

test("intégrité : une altération de la chaîne est détectée", async () => {
  await db
    .transaction(async (tx) => {
      await tx.exec(
        "ALTER TABLE fin_entry_lines DISABLE TRIGGER fin_lines_append_only",
      );
      await tx.query(
        "UPDATE fin_entry_lines SET debit=debit+1 WHERE (entry_id,line_no)=(SELECT entry_id,line_no FROM fin_entry_lines WHERE debit>0 ORDER BY entry_id LIMIT 1)",
      );
      const check = await one<{ broken_at: number | null }>(
        tx,
        "SELECT broken_at FROM app.fin_verify_chain($1)",
        [R],
      );
      assert.notEqual(check.broken_at, null);
      // Annule l’altération : les tests suivants repartent d’un journal sain.
      throw new Error("annulation volontaire");
    })
    .catch((e: Error) => {
      assert.equal(e.message, "annulation volontaire");
    });
  const ok = await one<{ broken_at: number | null }>(
    db,
    "SELECT broken_at FROM app.fin_verify_chain($1)",
    [R],
  );
  assert.equal(ok.broken_at, null);
});

test("écriture déséquilibrée refusée, même par la fonction de comptabilisation", async () => {
  const event = await one<{ dedupe_key: string }>(
    db,
    "SELECT e.dedupe_key FROM fin_events e WHERE e.restaurant_id=$1 AND NOT EXISTS(SELECT 1 FROM fin_entries n WHERE n.event_id=e.id) LIMIT 1",
    [R],
  );
  await assert.rejects(
    db.query("SELECT app.fin_post_entry($1,$2,'x',$3)", [
      R,
      event.dedupe_key,
      JSON.stringify([
        { account: "530", debit: 100, credit: 0, label: "x" },
        { account: "707", debit: 0, credit: 99, label: "x" },
      ]),
    ]),
    /déséquilibrée/,
  );
});

test("RLS : la salle règle sans lire les écritures, et comptabilise quand même", async () => {
  const [dish] = await dishes(1);
  const table = await freeTable();
  const order = await db.transaction((tx) =>
    createOrder(
      tx,
      {
        restaurant: R,
        table,
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
  for (const status of ["preparing", "ready", "served"])
    await db.transaction((tx) => changeItem(tx, R, line.id, status, owner));
  await asApp("sarah", R, (tx) => pay(tx, R, order, "card", waiter));
  await db.query("UPDATE dining_tables SET status='free' WHERE id=$1", [table]);
  const declaration = await one<{ id: string }>(
    db,
    "SELECT p.id FROM payment_declarations p JOIN orders o ON o.session_id=p.session_id WHERE o.id=$1",
    [order],
  );
  assert.equal((await entriesFor(declaration.id)).length, 1);
  for (const sql of [
    "SELECT * FROM fin_entries",
    "SELECT * FROM fin_entry_lines",
    "SELECT * FROM fin_events",
    "SELECT * FROM fin_review_items",
  ])
    assert.equal(
      (await asApp("sarah", R, (tx) => rows(tx, sql))).length,
      0,
      `${sql} doit être invisible pour la salle`,
    );
  // La fonction réservée à la finance et l’état complet sont refusés.
  await assert.rejects(
    asApp("sarah", R, (tx) =>
      tx.query("SELECT app.fin_reverse_entry($1,'x','motif assez long')", [R]),
    ),
  );
  await assert.rejects(
    asApp("sarah", R, (tx) =>
      tx.query("SELECT * FROM app.fin_verify_chain($1)", [R]),
    ),
  );
  await assert.rejects(
    asApp("sarah", R, (tx) => financeState(tx, R, waiter)),
    /refusé/,
  );
});

test("RLS : personne n’écrit directement dans le journal, pas même le propriétaire", async () => {
  const event = await one<{ id: string }>(
    db,
    "SELECT id FROM fin_events WHERE restaurant_id=$1 LIMIT 1",
    [R],
  );
  await assert.rejects(
    asApp("nadia", R, (tx) =>
      tx.query(
        "INSERT INTO fin_entries(id,restaurant_id,event_id,kind,number,entry_date,journal,label,previous_hash,hash) VALUES('x',$1,$2,'sale_payment',999,now(),'VE','x','','')",
        [R, event.id],
      ),
    ),
  );
  await assert.rejects(
    asApp("nadia", R, (tx) =>
      tx.query(
        "INSERT INTO fin_events(id,restaurant_id,type,dedupe_key,source_id,amount,occurred_at) VALUES('x',$1,'payment.confirmed','x','x',1,now())",
        [R],
      ),
    ),
  );
  assert.ok(
    (await asApp("nadia", R, (tx) => rows(tx, "SELECT id FROM fin_entries")))
      .length > 0,
  );
});

test("RLS : aucun accès entre établissements ni depuis un canal public", async () => {
  await db.query(
    "INSERT INTO profiles(id,name,role,email) VALUES('fin-other','Autre','OWNER','autre@example.test') ON CONFLICT DO NOTHING",
  );
  await db.query("SELECT set_config('app.user_id','fin-other',false)");
  await db.query(
    "SELECT app.bootstrap_organization('fin-org','Autre org','fin-r','Autre restaurant')",
  );
  await db.query("SELECT set_config('app.user_id','',false)");
  // Un autre propriétaire, sur le restaurant visé puis sur le sien.
  assert.equal(
    (
      await asApp("fin-other", R, (tx) =>
        rows(tx, "SELECT id FROM fin_entries"),
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await asApp("fin-other", "fin-r", (tx) =>
        rows(tx, "SELECT id FROM fin_entries"),
      )
    ).length,
    0,
  );
  await assert.rejects(
    asApp("fin-other", R, (tx) =>
      tx.query("SELECT app.fin_post_entry($1,'payment:x','x','[]')", [R]),
    ),
  );
  // Le canal public voit le menu de l’établissement, jamais ses écritures ni ses taux.
  assert.equal(
    (await asApp("", R, (tx) => rows(tx, "SELECT id FROM fin_entries"), true))
      .length,
    0,
  );
  assert.equal(
    (await asApp("", R, (tx) => rows(tx, "SELECT id FROM fin_tax_rates"), true))
      .length,
    0,
  );
  assert.equal(
    (await asApp("", R, (tx) => rows(tx, "SELECT * FROM fin_settings"), true))
      .length,
    0,
  );
});

test("boutique (lot 0) : remise déclarée, statut réglé et mode de consommation", async () => {
  const shop = commerce(R);
  const [dish] = await dishes(1);
  await db.query(
    "UPDATE shop_settings SET config=config||'{\"open\":true}'::jsonb WHERE restaurant_id=$1",
    [R],
  );
  const view = await state();
  const ten = (
    view.rates.find((r) => (r as { rate_bp: number }).rate_bp === 1000) as {
      id: string;
    }
  ).id;
  const five = (
    view.rates.find((r) => (r as { rate_bp: number }).rate_bp === 550) as {
      id: string;
    }
  ).id;
  await act({
    action: "productVat",
    menu: dish.id,
    onsite: ten,
    takeaway: five,
  });
  const order = await db.transaction(async (tx) => {
    const created = await createOrder(
      tx,
      {
        restaurant: R,
        channel: "takeaway",
        customer: "Client boutique",
        contact: "client@example.test",
        key: randomUUID(),
        items: [{ menu: dish.id, quantity: 2, note: "" }],
      },
      null,
    );
    await tx.query("UPDATE orders SET status='active' WHERE id=$1", [created]);
    await tx.query(
      "INSERT INTO shop_orders(order_id,token,request_hash,consumption,payment_method,total,subtotal,discount) VALUES($1,$2,'h','onsite','counter',$3,$4,200)",
      [
        created,
        randomUUID().replaceAll("-", "").padEnd(64, "0"),
        dish.price * 2 - 200,
        dish.price * 2,
      ],
    );
    return created;
  });
  // Mode à emporter figé par le canal ; le mode réel de la boutique impose sa révision.
  const frozen = () =>
    one<{ vat_rate_bp: number }>(
      db,
      "SELECT vat_rate_bp FROM order_items WHERE order_id=$1",
      [order],
    );
  assert.equal((await frozen()).vat_rate_bp, 550);
  await db.query("SELECT app.fin_freeze_order_vat($1,true)", [order]);
  assert.equal((await frozen()).vat_rate_bp, 1000);

  // Réglée avant préparation : elle reste active pour la cuisine.
  await db.transaction((tx) => shop.settle(tx, order, "cash", owner));
  const declared = await one<{ id: string; amount: number; discount: number }>(
    db,
    "SELECT id,amount,discount FROM payment_declarations WHERE order_id=$1",
    [order],
  );
  assert.equal(declared.discount, 200);
  assert.equal(declared.amount, dish.price * 2 - 200);
  const status = () =>
    one<{ status: string }>(db, "SELECT status FROM orders WHERE id=$1", [
      order,
    ]);
  assert.equal((await status()).status, "active");
  assert.equal((await entriesFor(declared.id)).length, 1);
  const [line] = await rows<{ id: string }>(
    db,
    "SELECT id FROM order_items WHERE order_id=$1",
    [order],
  );
  for (const target of ["preparing", "ready", "served"])
    await db.transaction((tx) => changeItem(tx, R, line.id, target, owner));
  assert.equal((await status()).status, "paid");
  // Rejouer une étape déjà faite reste sans effet ; revenir en arrière est refusé.
  await db.transaction((tx) => changeItem(tx, R, line.id, "served", owner));
  await assert.rejects(
    db.transaction((tx) => changeItem(tx, R, line.id, "cancelled", owner)),
    /déjà/,
  );
});

test("boutique (lot 0) : le coût matière compte les options, la TVA suit le mode réel", async () => {
  const shop = commerce(R);
  await shop.updateSettings(db, owner, {
    open: true,
    prepMinutes: 5,
    interval: 5,
    capacity: 20,
    hours: Array.from({ length: 7 }, (_, day) => ({
      day,
      open: "00:00",
      close: "23:59",
    })),
    categories: ["Entrées", "Plats", "Desserts", "Boissons"],
    address: "Test",
    phone: "",
    logo: "",
  });
  const [dish] = await dishes(1);
  const ingredient = await one<{ id: string; cost: number }>(
    db,
    "SELECT i.id,i.cost::float AS cost FROM ingredients i WHERE i.restaurant_id=$1 AND i.cost>0 AND EXISTS(SELECT 1 FROM stock_lots l WHERE l.ingredient_id=i.id AND l.expires_on>=CURRENT_DATE AND l.quantity-l.reserved>100) LIMIT 1",
    [R],
  );
  await db.query("UPDATE menu_items SET options=$2 WHERE id=$1", [
    dish.id,
    JSON.stringify([
      {
        id: "sup",
        label: "Supplément",
        required: false,
        multiple: true,
        choices: [{ id: "extra", label: "Extra", price: 150 }],
      },
    ]),
  ]);
  await db.query("INSERT INTO option_recipes VALUES($1,'sup:extra',$2,2)", [
    dish.id,
    ingredient.id,
  ]);
  const slot = (await shop.slots(db))[0];
  const placed = await db.transaction((tx) =>
    shop.checkout(tx, {
      key: randomUUID(),
      customer: "Client options",
      email: "options@example.test",
      consumption: "onsite",
      payment: "counter",
      termsAccepted: true,
      slot,
      items: [{ menu: dish.id, quantity: 1, choices: ["sup:extra"], note: "" }],
    }),
  );
  const line = await one<{
    price: number;
    material_cost: number;
    vat_rate_bp: number;
  }>(
    db,
    "SELECT price,material_cost::float AS material_cost,vat_rate_bp FROM order_items WHERE order_id=$1",
    [placed.order_id],
  );
  const base = await one<{ cost: number }>(
    db,
    "SELECT coalesce(sum(r.quantity*i.cost),0)::float AS cost FROM recipe_ingredients r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.menu_id=$1",
    [dish.id],
  );
  assert.equal(line.price, dish.price + 150);
  assert.ok(
    Math.abs(line.material_cost - (base.cost + 2 * ingredient.cost)) < 1e-6,
  );
  // Canal « à emporter » côté commande, mais consommation sur place : taux sur place.
  assert.equal(line.vat_rate_bp, 1000);
});

test("migration : la descente puis la remontée redonnent un schéma fonctionnel", async () => {
  const scratch = new PGlite();
  try {
    await scratch.exec(
      await readFile("database/migrations/001_core.sql", "utf8"),
    );
    await migrate(scratch);
    await scratch.transaction(seed);
    await scratch.exec(
      await readFile("database/migrations/down/041_sales_invoices.sql", "utf8"),
    );
    await scratch.exec(
      await readFile("database/migrations/down/040_hr_payroll.sql", "utf8"),
    );
    await scratch.exec(
      await readFile(
        "database/migrations/down/039_bank_reconciliation.sql",
        "utf8",
      ),
    );
    await scratch.exec(
      await readFile(
        "database/migrations/down/038_supplier_invoices.sql",
        "utf8",
      ),
    );
    await scratch.exec(
      await readFile(
        "database/migrations/down/037_online_payments.sql",
        "utf8",
      ),
    );
    await scratch.exec(
      await readFile("database/migrations/down/036_finance_core.sql", "utf8"),
    );
    // État laissé par l’ancien code : commande boutique réglée, active, remise perdue.
    const dish = await scratch.query<{ id: string }>(
      "SELECT id FROM menu_items WHERE restaurant_id=$1 LIMIT 1",
      [R],
    );
    await scratch.query(
      "INSERT INTO orders(id,restaurant_id,channel,status,idempotency_key) VALUES('legacy',$1,'takeaway','active','legacy-key')",
      [R],
    );
    await scratch.query(
      "INSERT INTO order_items(id,order_id,menu_id,name,price,quantity,station,status) VALUES('legacy-i','legacy',$1,'Plat',1000,1,'kitchen','served')",
      [dish.rows[0].id],
    );
    await scratch.query(
      "INSERT INTO shop_orders(order_id,token,request_hash,consumption,payment_method,payment_status,total,subtotal,discount) VALUES('legacy','legacy-token','h','onsite','counter','paid',800,1000,200)",
    );
    await scratch.query(
      "INSERT INTO payment_declarations(id,order_id,amount,method,actor) VALUES('legacy-p','legacy',800,'cash','nadia')",
    );
    const gone = await scratch.query<{ t: string | null }>(
      "SELECT to_regclass('public.fin_entries')::text AS t",
    );
    assert.equal(gone.rows[0].t, null);
    await migrate(scratch);
    const back = await scratch.query<{ t: string | null }>(
      "SELECT to_regclass('public.fin_entries')::text AS t",
    );
    assert.equal(back.rows[0].t, "fin_entries");
    const repaired = await scratch.query<{
      discount: number;
      status: string;
      events: number;
    }>(
      "SELECT p.discount,o.status,(SELECT count(*)::int FROM fin_events e WHERE e.dedupe_key='payment:legacy-p') AS events FROM payment_declarations p JOIN orders o ON o.id=p.order_id WHERE p.id='legacy-p'",
    );
    assert.deepEqual(repaired.rows[0], {
      discount: 200,
      status: "paid",
      events: 1,
    });
  } finally {
    await scratch.close();
  }
});

test("lot 6 : compteur isolé par établissement, réservé à la finance et sans lecture directe permanente", async () => {
  await assert.rejects(
    asApp("nadia", "bernay", (tx) => tx.query("SELECT * FROM fin_counters")),
    /permission denied/,
  );
  for (const [user, restaurant, expected] of [
    ["nadia", "bernay", "bernay"],
    ["nadia", "atelier", "atelier"],
    ["nadia", "tenant-other-site", "tenant-other-site"],
    ["sarah", "bernay", ""],
  ] as const) {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO organizations(id,name) VALUES('tenant-other','Autre organisation')",
        );
        await tx.query(
          "INSERT INTO restaurants(id,name,organization_id) VALUES('tenant-other-site','Autre établissement','tenant-other')",
        );
        await tx.query(
          "INSERT INTO memberships(profile_id,restaurant_id,role) VALUES('nadia','tenant-other-site','OWNER')",
        );
        await tx.query(
          "INSERT INTO fin_counters(restaurant_id) VALUES('bernay'),('atelier'),('tenant-other-site') ON CONFLICT DO NOTHING",
        );
        await tx.exec("GRANT SELECT ON fin_counters TO atacuisine_app");
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        await tx.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)",
          [user, restaurant],
        );
        const result = await tx.query<{ restaurant_id: string }>(
          "SELECT restaurant_id FROM fin_counters ORDER BY restaurant_id",
        );
        assert.deepEqual(
          result.rows.map((row) => row.restaurant_id),
          expected ? [expected] : [],
        );
        throw new Error("ROLLBACK LOT6");
      }),
      /ROLLBACK LOT6/,
    );
  }
  await assert.rejects(
    asApp("nadia", "bernay", (tx) => tx.query("SELECT * FROM fin_counters")),
    /permission denied/,
  );
});
