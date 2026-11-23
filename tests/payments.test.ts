import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import Stripe from "stripe";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { one, rows } from "../src/infrastructure/database/db";
import { withDatabaseContext } from "../src/infrastructure/database/context";
import { changeItem, createOrder } from "../src/features/orders/service";
import { commerce } from "../src/features/commerce/service";
import { financeAction, financeState } from "../src/features/finance/service";
import {
  constructEvent,
  holdDays,
  splitAmount,
  stripe,
  setStripeClient,
} from "../src/features/payments/config";
import {
  expireUnpaid,
  handleEvent,
  minimalEvent,
  nextPayoutDate,
  paymentAction,
  paymentsState,
  runScheduledPayout,
  sendPayout,
  startCheckout,
  type MinimalEvent,
  type Run,
} from "../src/features/payments/service";
import { snapshot } from "../src/application/snapshot";

const R = "bernay";
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
let db: PGlite;

/** Rôle réel de chaque chemin : aucun n’agit en propriétaire de la base. */
const role =
  (name: string, userId: string, isPublic: boolean): Run =>
  (fn) =>
    withDatabaseContext({ userId, restaurantId: R, public: isPublic }, () =>
      db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE ${name}`);
        await tx.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true)",
          [userId, R, String(isPublic)],
        );
        return fn(tx);
      }),
    ) as never;
const web = role("atacuisine_app", "nadia", false);
const server = role("atacuisine_app", "sarah", false);
const visitor = role("atacuisine_app", "", true);
const worker = role("atacuisine_worker", "", true);

/** Stripe simulé : enregistre les appels, applique l’idempotence comme le vrai. */
const calls: { kind: string; params: unknown; key?: string }[] = [];
let accountStatus = "active";
let riskLevel = "normal";
const seen = new Map<string, unknown>();
const once = (
  kind: string,
  params: unknown,
  key: string | undefined,
  value: unknown,
) => {
  calls.push({ kind, params, key });
  if (key && seen.has(key)) return seen.get(key);
  if (key) seen.set(key, value);
  return value;
};
const fake = {
  v2: {
    core: {
      accounts: {
        create: async (p: unknown, o?: { idempotencyKey?: string }) =>
          once("account", p, o?.idempotencyKey, { id: "acct_test" }),
        retrieve: async () => ({
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: { stripe_transfers: { status: accountStatus } },
              },
            },
          },
        }),
      },
      accountLinks: {
        create: async (p: unknown) =>
          once("link", p, undefined, { url: "https://stripe.test/onboard" }),
      },
    },
  },
  checkout: {
    sessions: {
      create: async (
        p: { client_reference_id: string },
        o?: { idempotencyKey?: string },
      ) =>
        once("session", p, o?.idempotencyKey, {
          id: `cs_${p.client_reference_id}`,
          url: `https://stripe.test/pay/${p.client_reference_id}`,
        }),
    },
  },
  paymentIntents: {
    retrieve: async () => ({
      latest_charge: { outcome: { risk_level: riskLevel } },
    }),
  },
  transfers: {
    create: async (p: unknown, o?: { idempotencyKey?: string }) =>
      once("transfer", p, o?.idempotencyKey, { id: `tr_${randomUUID()}` }),
    createReversal: async (
      id: string,
      p: unknown,
      o?: { idempotencyKey?: string },
    ) =>
      once("reversal", { id, ...(p as object) }, o?.idempotencyKey, {
        id: "trr",
      }),
  },
  refunds: {
    create: async (p: unknown, o?: { idempotencyKey?: string }) =>
      once("refund", p, o?.idempotencyKey, { id: "re" }),
  },
  accounts: {
    createLoginLink: async () => ({ url: "https://stripe.test/login" }),
  },
};
const count = (kind: string) => calls.filter((c) => c.kind === kind).length;

const event = (type: string, object: Record<string, unknown>): MinimalEvent =>
  ({ id: `evt_${randomUUID()}`, type, object }) as MinimalEvent;
const dish = () =>
  one<{ id: string; price: number }>(
    db,
    "SELECT m.id,m.price FROM menu_items m WHERE m.restaurant_id=$1 AND m.enabled AND m.archived_at IS NULL AND m.price>=100 AND EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id) AND NOT EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id AND coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=r.ingredient_id AND l.expires_on>=CURRENT_DATE),0)<r.quantity*5) ORDER BY m.price DESC LIMIT 1",
    [R],
  );
/** Commande client en ligne, de la boutique au paiement ouvert. */
async function placeOrder() {
  const product = await dish();
  const shop = commerce(R);
  const slot = (await shop.slots(db))[0];
  const placed = await visitor((tx) =>
    shop.checkout(tx, {
      key: randomUUID(),
      customer: "Client en ligne",
      email: "client@example.test",
      consumption: "takeaway",
      payment: "stripe",
      termsAccepted: true,
      slot,
      items: [{ menu: product.id, quantity: 1, choices: [], note: "" }],
    }),
  );
  await startCheckout(visitor, R, {
    token: placed.token,
    path: `/r/${R}/boutique`,
  });
  return { order: placed.order_id, token: placed.token, gross: product.price };
}
async function placeAndPay() {
  const placed = await placeOrder();
  const completed = event("checkout.session.completed", {
    id: `cs_${placed.order}`,
    payment_status: "paid",
    payment_intent: `pi_${placed.order}`,
    amount_total: placed.gross,
  });
  await handleEvent(worker, R, completed);
  return { ...placed, intent: `pi_${placed.order}`, completed };
}
const payment = (order: string) =>
  one<{
    id: string;
    status: string;
    risk_status: string;
    net: number;
    gross: number;
    commission: number;
    stripe_fee_estimate: number;
    payout_id: string | null;
    available_at: string;
    hold_days: number;
  }>(db, "SELECT * FROM online_payments WHERE order_id=$1", [order]);
const mature = (order: string) =>
  db.query(
    "UPDATE online_payments SET available_at=now()-interval '1 minute' WHERE order_id=$1",
    [order],
  );
const finance = (a: Parameters<typeof financeAction>[3]) =>
  db.transaction((tx) => financeAction(tx, R, owner, a));
const clearDue = () =>
  db.query(
    "UPDATE online_payments SET available_at=now()+interval '1 day' WHERE restaurant_id=$1 AND status='paid' AND available_at<=now()",
    [R],
  );

before(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_simule";
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  setStripeClient(fake);
  await commerce(R).updateSettings(db, owner, {
    open: true,
    prepMinutes: 5,
    interval: 5,
    capacity: 50,
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
  const view = await db.transaction((tx) => financeState(tx, R, owner));
  const s = view.settings;
  await finance({
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
    await finance({
      action: "categoryVat",
      category: c.category,
      onsite: ten.id,
      takeaway: ten.id,
    });
});
beforeEach(() => {
  accountStatus = "active";
  riskLevel = "normal";
});
after(async () => {
  setStripeClient(undefined);
  delete process.env.STRIPE_SECRET_KEY;
  await db.close();
});

test("calcul : 7 % + 3 % estimés, sans perdre un centime", () => {
  assert.deepEqual(splitAmount(10000), {
    commission: 700,
    stripeFeeEstimate: 300,
    net: 9000,
  });
  for (const gross of [50, 99, 1234, 999999]) {
    const s = splitAmount(gross);
    assert.equal(s.commission + s.stripeFeeEstimate + s.net, gross);
  }
  assert.equal(holdDays(), 31);
});

test("calendrier : versement le 1er et le 16", () => {
  const day = (iso: string) =>
    nextPayoutDate(new Date(iso)).toISOString().slice(0, 10);
  assert.equal(day("2026-11-08T12:00:00Z"), "2026-11-16");
  assert.equal(day("2026-11-16T12:00:00Z"), "2026-12-01");
  assert.equal(day("2026-12-20T12:00:00Z"), "2027-01-01");
});

test("sécurité : une clé réelle est refusée sans validation explicite", () => {
  setStripeClient(undefined);
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_live_interdite";
  try {
    assert.throws(() => stripe(), /refusée/);
    process.env.STRIPE_SECRET_KEY = "rk_live_interdite";
    assert.throws(() => stripe(), /refusée/);
  } finally {
    process.env.STRIPE_SECRET_KEY = previous;
    setStripeClient(fake);
  }
});

test("webhook : signature exigée, et données client absentes de ce qui est conservé", () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const raw = JSON.stringify({
    id: "evt_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        payment_status: "paid",
        payment_intent: "pi_1",
        amount_total: 1000,
        customer_details: { email: "client@example.test" },
        metadata: { order: "o1", restaurant: R },
      },
    },
  });
  const header = Stripe.webhooks.generateTestHeaderString({
    payload: raw,
    secret: "whsec_test",
  });
  const parsed = constructEvent(raw, header);
  const minimal = minimalEvent(parsed);
  assert.equal(minimal.object.order, "o1");
  assert.ok(!JSON.stringify(minimal).includes("client@example.test"));
  assert.throws(
    () => constructEvent(raw, "t=1,v1=faux"),
    /Signature Stripe invalide/,
  );
  assert.throws(
    () => constructEvent(`${raw} `, header),
    /Signature Stripe invalide/,
  );
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.throws(() => constructEvent(raw, header), /Webhook non configuré/);
});

test("sans compte actif, le paiement en ligne reste fermé au client", async () => {
  const shop = commerce(R);
  const catalog = await visitor((tx) => shop.catalog(tx));
  assert.equal((catalog as { stripe: boolean }).stripe, false);
  const product = await dish();
  await assert.rejects(
    visitor((tx) =>
      shop.checkout(tx, {
        key: randomUUID(),
        customer: "Client",
        email: "c@example.test",
        consumption: "takeaway",
        payment: "stripe",
        termsAccepted: true,
        slot: new Date().toISOString(),
        items: [{ menu: product.id, quantity: 1, choices: [], note: "" }],
      }),
    ),
    /indisponible/,
  );
});

test("activation : compte Express, responsabilité plateforme, rejouable, finance seulement", async () => {
  await assert.rejects(
    paymentAction(server, R, waiter, { action: "onboard" }),
    /refusé/,
  );
  accountStatus = "unrequested";
  const first = await paymentAction(web, R, owner, { action: "onboard" });
  assert.deepEqual(first, { url: "https://stripe.test/onboard" });
  const params = calls.find((c) => c.kind === "account")!.params as {
    dashboard: string;
    defaults: { responsibilities: Record<string, string> };
    configuration: { recipient: unknown; merchant?: unknown };
  };
  assert.equal(params.dashboard, "express");
  assert.deepEqual(params.defaults.responsibilities, {
    fees_collector: "application",
    losses_collector: "application",
  });
  assert.equal(params.configuration.merchant, undefined);
  await paymentAction(web, R, owner, { action: "onboard" });
  assert.equal(count("account"), 1);
  assert.equal((await paymentsState(web, R, owner)).status, "pending");
  await assert.rejects(
    paymentAction(web, R, owner, { action: "request" }),
    /pas encore actif/,
  );
  accountStatus = "active";
  assert.equal((await paymentsState(web, R, owner)).status, "active");
  const planned = await rows(
    db,
    "SELECT id FROM outbox_jobs WHERE restaurant_id=$1 AND kind='payout_schedule'",
    [R],
  );
  assert.equal(planned.length, 1);
});

test("commande en ligne : invisible en cuisine et non confirmable avant le paiement", async () => {
  const placed = await placeOrder();
  const session = calls.filter((c) => c.kind === "session").at(-1)!;
  const params = session.params as Record<string, unknown>;
  assert.equal(params.payment_method_types, undefined);
  assert.equal(params.application_fee_amount, undefined);
  assert.match(
    String(params.integration_identifier),
    /^dattier-boutique-[a-zA-Z]{8}$/,
  );
  // Rejouer le bouton de paiement rouvre la même session.
  const again = await startCheckout(visitor, R, {
    token: placed.token,
    path: `/r/${R}/boutique`,
  });
  assert.equal(again.url, `https://stripe.test/pay/${placed.order}`);
  const seenByStaff = await db.transaction((tx) => snapshot(tx, owner, R));
  assert.ok(!seenByStaff.orders.some((o) => o.id === placed.order));
  await assert.rejects(
    startCheckout(visitor, R, {
      token: placed.token,
      path: "https://ailleurs.test/",
    }),
  );
  await assert.rejects(
    db.transaction((tx) => changeItem(tx, R, "inconnu", "preparing", owner)),
  );
});

test("paiement confirmé : cuisine, TVA du restaurant et compte d’attente, sans doublon", async () => {
  const placed = await placeAndPay();
  const order = await one<{ status: string }>(
    db,
    "SELECT status FROM orders WHERE id=$1",
    [placed.order],
  );
  assert.equal(order.status, "active");
  const p = await payment(placed.order);
  assert.equal(p.status, "paid");
  assert.equal(p.risk_status, "clear");
  assert.equal(p.net, placed.gross - p.commission - p.stripe_fee_estimate);
  assert.ok(new Date(p.available_at).getTime() > Date.now() + 30 * 86400_000);
  const line = await one<{ vat_rate_bp: number }>(
    db,
    "SELECT vat_rate_bp FROM order_items WHERE order_id=$1",
    [placed.order],
  );
  assert.equal(line.vat_rate_bp, 1000);
  const entry = await rows<{
    account_code: string;
    debit: number;
    credit: number;
  }>(
    db,
    `SELECT l.account_code,l.debit,l.credit FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id JOIN fin_events e ON e.id=n.event_id
      JOIN payment_declarations d ON 'payment:'||d.id=e.dedupe_key WHERE d.order_id=$1 ORDER BY l.line_no`,
    [placed.order],
  );
  assert.equal(entry[0].account_code, "4671");
  assert.equal(Number(entry[0].debit), placed.gross);
  assert.ok(entry.some((l) => l.account_code === "445711"));
  await handleEvent(worker, R, placed.completed);
  assert.equal(
    (
      await rows(db, "SELECT id FROM payment_declarations WHERE order_id=$1", [
        placed.order,
      ])
    ).length,
    1,
  );
});

test("versement : rien avant le délai, puis un seul transfert du net", async () => {
  await clearDue();
  const placed = await placeAndPay();
  await assert.rejects(
    paymentAction(web, R, owner, { action: "request" }),
    /Aucun montant disponible/,
  );
  await assert.rejects(
    paymentAction(server, R, waiter, { action: "request" }),
    /refusé/,
  );
  await mature(placed.order);
  const p = await payment(placed.order);
  assert.equal(
    (await paymentsState(web, R, owner)).totals.available >= p.net,
    true,
  );
  const { payout } = (await paymentAction(web, R, owner, {
    action: "request",
  })) as { payout: string };
  assert.equal((await payment(placed.order)).status, "released");
  const before = count("transfer");
  await sendPayout(worker, R, payout);
  await sendPayout(worker, R, payout);
  assert.equal(count("transfer"), before + 1);
  const transfer = calls.filter((c) => c.kind === "transfer").at(-1)!;
  assert.equal(transfer.key, `payout-${payout}`);
  assert.equal((transfer.params as { amount: number }).amount, p.net);
  assert.equal(
    (transfer.params as { destination: string }).destination,
    "acct_test",
  );
  const lines = await rows<{
    account_code: string;
    debit: number;
    credit: number;
  }>(
    db,
    "SELECT l.account_code,l.debit,l.credit FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id WHERE n.kind='payout' AND n.event_id=(SELECT id FROM fin_events WHERE dedupe_key=$1) ORDER BY line_no",
    [`payout:${payout}`],
  );
  assert.deepEqual(
    lines.map((l) => l.account_code),
    ["580", "6222", "4671"],
  );
  assert.equal(
    Number(lines[0].debit) + Number(lines[1].debit),
    Number(lines[2].credit),
  );
});

test("anti-fraude : un paiement à risque ou au montant anormal n’est jamais versé seul", async () => {
  await clearDue();
  riskLevel = "elevated";
  const risky = await placeAndPay();
  riskLevel = "normal";
  const odd = await placeOrder();
  await handleEvent(
    worker,
    R,
    event("checkout.session.completed", {
      id: `cs_${odd.order}`,
      payment_status: "paid",
      payment_intent: `pi_${odd.order}`,
      amount_total: odd.gross - 1,
    }),
  );
  assert.equal((await payment(risky.order)).risk_status, "review");
  assert.equal((await payment(odd.order)).risk_status, "review");
  await mature(risky.order);
  await mature(odd.order);
  await assert.rejects(
    paymentAction(web, R, owner, { action: "request" }),
    /Aucun montant/,
  );
  // Le restaurateur ne peut pas lever lui-même le contrôle.
  const changed = await web((tx) =>
    tx.query("UPDATE online_payments SET risk_status='clear'"),
  );
  assert.equal(changed.affectedRows, 0);
  const state = await paymentsState(web, R, owner);
  assert.ok(state.totals.checking > 0);
  await db.query(
    "UPDATE online_payments SET status='refunded' WHERE order_id=ANY($1::text[])",
    [[risky.order, odd.order]],
  );
});

test("remboursement avant versement : vente annulée, rien à transférer", async () => {
  await clearDue();
  const placed = await placeAndPay();
  await paymentAction(web, R, owner, {
    action: "refund",
    id: (await payment(placed.order)).id,
  });
  assert.equal(count("refund") > 0, true);
  const reversals = count("reversal");
  await handleEvent(
    worker,
    R,
    event("charge.refunded", {
      id: "ch",
      payment_intent: placed.intent,
      amount: placed.gross,
      amount_refunded: placed.gross,
    }),
  );
  assert.equal((await payment(placed.order)).status, "refunded");
  assert.equal(count("reversal"), reversals);
  const kinds = await rows<{ kind: string }>(
    db,
    "SELECT n.kind FROM fin_entries n JOIN fin_events e ON e.id=n.event_id JOIN payment_declarations d ON 'payment:'||d.id=e.dedupe_key WHERE d.order_id=$1 ORDER BY n.number",
    [placed.order],
  );
  assert.deepEqual(
    kinds.map((k) => k.kind),
    ["sale_payment", "reversal"],
  );
  // Rien ne reste à vérifier : le remboursement a déjà tout soldé.
  const open = await rows(
    db,
    "SELECT v.id FROM fin_review_items v JOIN fin_events e ON e.id=v.event_id JOIN payment_declarations d ON 'payment:'||d.id=e.dedupe_key WHERE d.order_id=$1 AND v.status='open'",
    [placed.order],
  );
  assert.equal(open.length, 0);
  await assert.rejects(
    paymentAction(web, R, owner, {
      action: "refund",
      id: (await payment(placed.order)).id,
    }),
    /ne peut pas/,
  );
});

test("remboursement après versement : reprise du net, écritures soldées, rejouable", async () => {
  await clearDue();
  const placed = await placeAndPay();
  await mature(placed.order);
  const { payout } = (await paymentAction(web, R, owner, {
    action: "request",
  })) as { payout: string };
  await sendPayout(worker, R, payout);
  const p = await payment(placed.order);
  const refunded = event("charge.refunded", {
    id: "ch",
    payment_intent: placed.intent,
    amount: placed.gross,
    amount_refunded: placed.gross,
  });
  await handleEvent(worker, R, refunded);
  await handleEvent(worker, R, refunded);
  const reversal = calls.filter((c) => c.kind === "reversal").at(-1)!;
  assert.equal((reversal.params as { amount: number }).amount, p.net);
  assert.equal(reversal.key, `reversal-${p.id}`);
  // Le compte d’attente de cette vente revient exactement à zéro.
  const waiting = await one<{ total: number }>(
    db,
    `SELECT coalesce(sum(l.debit-l.credit),0)::int AS total FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id JOIN fin_events e ON e.id=n.event_id
      WHERE l.account_code='4671' AND e.dedupe_key IN ((SELECT 'payment:'||id FROM payment_declarations WHERE order_id=$1),$2,$3)`,
    [placed.order, `payout:${payout}`, `payout-reversal:${p.id}`],
  );
  assert.equal(waiting.total, 0);
  const lines = await rows<{ account_code: string }>(
    db,
    "SELECT l.account_code FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id WHERE n.kind='payout_reversal' AND n.event_id=(SELECT id FROM fin_events WHERE dedupe_key=$1) ORDER BY line_no",
    [`payout-reversal:${p.id}`],
  );
  assert.deepEqual(
    lines.map((l) => l.account_code),
    ["4671", "580", "6222"],
  );
  const chain = await one<{ broken_at: number | null }>(
    db,
    "SELECT broken_at FROM app.fin_verify_chain($1)",
    [R],
  );
  assert.equal(chain.broken_at, null);
});

test("remboursement partiel : sorti des versements, signalé pour correction", async () => {
  await clearDue();
  const placed = await placeAndPay();
  await handleEvent(
    worker,
    R,
    event("charge.refunded", {
      id: "ch",
      payment_intent: placed.intent,
      amount: placed.gross,
      amount_refunded: 10,
    }),
  );
  assert.equal((await payment(placed.order)).status, "manual_review");
  const view = await db.transaction((tx) => financeState(tx, R, owner));
  assert.ok(
    view.review.some(
      (r) => r.kind === "correction" && /partiel/.test(r.message),
    ),
  );
});

test("litige : bloque le versement, gagné il repart, perdu la vente est annulée", async () => {
  await clearDue();
  const won = await placeAndPay();
  await handleEvent(
    worker,
    R,
    event("charge.dispute.created", {
      id: "dp",
      payment_intent: won.intent,
      status: "needs_response",
    }),
  );
  assert.equal((await payment(won.order)).status, "disputed");
  await mature(won.order);
  await assert.rejects(
    paymentAction(web, R, owner, { action: "request" }),
    /Aucun montant/,
  );
  await handleEvent(
    worker,
    R,
    event("charge.dispute.closed", {
      id: "dp",
      payment_intent: won.intent,
      status: "won",
    }),
  );
  assert.equal((await payment(won.order)).status, "paid");
  await clearDue();
  const lost = await placeAndPay();
  await handleEvent(
    worker,
    R,
    event("charge.dispute.created", {
      id: "dq",
      payment_intent: lost.intent,
      status: "needs_response",
    }),
  );
  await handleEvent(
    worker,
    R,
    event("charge.dispute.closed", {
      id: "dq",
      payment_intent: lost.intent,
      status: "lost",
    }),
  );
  assert.equal((await payment(lost.order)).status, "refunded");
});

test("versement en préparation : une vente remboursée en est retirée à temps", async () => {
  await clearDue();
  const kept = await placeAndPay();
  const gone = await placeAndPay();
  await mature(kept.order);
  await mature(gone.order);
  const { payout } = (await paymentAction(web, R, owner, {
    action: "request",
  })) as { payout: string };
  const keptNet = (await payment(kept.order)).net;
  await handleEvent(
    worker,
    R,
    event("charge.refunded", {
      id: "ch",
      payment_intent: gone.intent,
      amount: gone.gross,
      amount_refunded: gone.gross,
    }),
  );
  const row = await one<{ amount: number }>(
    db,
    "SELECT amount FROM online_payouts WHERE id=$1",
    [payout],
  );
  assert.equal(row.amount, keptNet);
  await sendPayout(worker, R, payout);
  const sent = calls.filter((c) => c.kind === "transfer").at(-1)!;
  assert.equal((sent.params as { amount: number }).amount, keptNet);
});

test("paiement abandonné : stock libéré, et paiement tardif remboursé d’office", async () => {
  const placed = await placeOrder();
  const reserved = () =>
    one<{ total: number }>(
      db,
      "SELECT coalesce(sum(s.quantity),0)::float AS total FROM stock_reservations s JOIN order_items i ON i.id=s.item_id WHERE i.order_id=$1 AND s.status='reserved'",
      [placed.order],
    );
  assert.ok((await reserved()).total > 0);
  await expireUnpaid(worker, R, placed.order);
  assert.equal((await reserved()).total, 0);
  assert.equal(
    (
      await one<{ status: string }>(
        db,
        "SELECT status FROM orders WHERE id=$1",
        [placed.order],
      )
    ).status,
    "cancelled",
  );
  assert.equal((await payment(placed.order)).status, "expired");
  const refunds = count("refund");
  await handleEvent(
    worker,
    R,
    event("checkout.session.completed", {
      id: `cs_${placed.order}`,
      payment_status: "paid",
      payment_intent: `pi_${placed.order}`,
      amount_total: placed.gross,
    }),
  );
  assert.equal(count("refund"), refunds + 1);
  assert.equal((await payment(placed.order)).status, "manual_review");
  assert.equal(
    (
      await rows(db, "SELECT id FROM payment_declarations WHERE order_id=$1", [
        placed.order,
      ])
    ).length,
    0,
  );
  await handleEvent(
    worker,
    R,
    event("charge.refunded", {
      id: "ch",
      payment_intent: `pi_${placed.order}`,
      amount: placed.gross,
      amount_refunded: placed.gross,
    }),
  );
  assert.equal((await payment(placed.order)).status, "refunded");
});

test("versement automatique : part à la date prévue, puis programme le suivant", async () => {
  await clearDue();
  const placed = await placeAndPay();
  await mature(placed.order);
  await runScheduledPayout(worker, R);
  const p = await payment(placed.order);
  assert.equal(p.status, "released");
  const row = await one<{ reason: string }>(
    db,
    "SELECT reason FROM online_payouts WHERE id=$1",
    [p.payout_id],
  );
  assert.equal(row.reason, "schedule");
  const jobs = await rows(
    db,
    "SELECT id FROM outbox_jobs WHERE kind='stripe_payout' AND dedupe_key=$1",
    [p.payout_id],
  );
  assert.equal(jobs.length, 1);
  await db.query("SELECT 1");
});

test("TVA : le taux de catégorie s’applique, celui du produit prime, le calcul est disponible", async () => {
  const view = await db.transaction((tx) => financeState(tx, R, owner));
  const twenty = (view.rates as { id: string; rate_bp: number }[]).find(
    (r) => r.rate_bp === 2000,
  )!;
  const product = await dish();
  const order = await db.transaction((tx) =>
    createOrder(
      tx,
      {
        restaurant: R,
        channel: "takeaway",
        customer: "A",
        contact: "a@example.test",
        key: randomUUID(),
        items: [{ menu: product.id, quantity: 1, note: "" }],
      },
      null,
    ),
  );
  const bp = async (o: string) =>
    (
      await one<{ vat_rate_bp: number }>(
        db,
        "SELECT vat_rate_bp FROM order_items WHERE order_id=$1",
        [o],
      )
    ).vat_rate_bp;
  assert.equal(await bp(order), 1000);
  await finance({
    action: "productVat",
    menu: product.id,
    onsite: twenty.id,
    takeaway: twenty.id,
  });
  const second = await db.transaction((tx) =>
    createOrder(
      tx,
      {
        restaurant: R,
        channel: "takeaway",
        customer: "B",
        contact: "b@example.test",
        key: randomUUID(),
        items: [{ menu: product.id, quantity: 1, note: "" }],
      },
      null,
    ),
  );
  assert.equal(await bp(second), 2000);
  await finance({
    action: "productVat",
    menu: product.id,
    onsite: null,
    takeaway: null,
  });
  await assert.rejects(
    finance({
      action: "categoryVat",
      category: "Inconnue",
      onsite: twenty.id,
      takeaway: null,
    }),
  );
  const summary = (await db.transaction((tx) => financeState(tx, R, owner)))
    .vatSummary as { label: string; net: number; vat: number }[];
  assert.ok(summary.some((s) => s.label === "10 %" && Number(s.vat) > 0));
});

test("RLS : salle et public ne voient rien ; personne ne s’écrit un versement", async () => {
  for (const table of [
    "online_payments",
    "online_payouts",
    "connect_accounts",
  ]) {
    assert.equal(
      (await server((tx) => rows(tx, `SELECT * FROM ${table}`))).length,
      0,
      table,
    );
    assert.equal(
      (await visitor((tx) => rows(tx, `SELECT * FROM ${table}`))).length,
      0,
      table,
    );
  }
  assert.ok(
    (await web((tx) => rows(tx, "SELECT * FROM online_payments"))).length > 0,
  );
  await assert.rejects(
    visitor((tx) =>
      tx.query("SELECT app.online_release_due($1,'request','x')", [R]),
    ),
    /refusé/,
  );
  await assert.rejects(
    server((tx) =>
      tx.query("SELECT app.online_release_due($1,'request','sarah')", [R]),
    ),
    /refusé/,
  );
  await assert.rejects(
    web((tx) =>
      tx.query(
        "INSERT INTO online_payouts(id,restaurant_id,gross,commission,stripe_fee_estimate,amount,reason) VALUES('x',$1,1,0,0,1,'request')",
        [R],
      ),
    ),
  );
  await assert.rejects(
    web((tx) =>
      tx.query(
        "SELECT app.fin_post_transfer($1,'x','payout.sent','x',1,'payout','x','[]')",
        [R],
      ),
    ),
    /refusé/,
  );
  // Le canal public ne dépose qu’un paiement en attente, jamais un paiement déjà réglé.
  const order = await one<{ id: string }>(
    db,
    "SELECT id FROM orders WHERE restaurant_id=$1 AND NOT EXISTS(SELECT 1 FROM online_payments p WHERE p.order_id=orders.id) LIMIT 1",
    [R],
  );
  await assert.rejects(
    visitor((tx) =>
      tx.query(
        "INSERT INTO online_payments(id,restaurant_id,order_id,session_id,gross,commission,stripe_fee_estimate,net,hold_days,status) VALUES('x',$1,$2,'cs_x',100,0,0,100,0,'paid')",
        [R, order.id],
      ),
    ),
  );
  const changed = await web((tx) =>
    tx.query(
      "UPDATE online_payments SET available_at=now()-interval '99 days'",
    ),
  );
  assert.equal(changed.affectedRows, 0);
});

test("migration : descente refusée avec des paiements, puis cycle complet à vide", async () => {
  await assert.rejects(
    db.exec(
      await readFile(
        "database/migrations/down/037_online_payments.sql",
        "utf8",
      ),
    ),
    /Retour arrière refusé/,
  );
  const scratch = new PGlite();
  try {
    await scratch.exec(
      await readFile("database/migrations/001_core.sql", "utf8"),
    );
    await migrate(scratch);
    await scratch.exec(
      await readFile("database/migrations/down/041_sales_invoices.sql", "utf8"),
    );
    await scratch.exec(
      await readFile("database/migrations/down/040_hr_payroll.sql", "utf8"),
    );
    await scratch.exec(
      await readFile("database/migrations/down/039_bank_reconciliation.sql", "utf8"),
    );
    await scratch.exec(
      await readFile("database/migrations/down/038_supplier_invoices.sql", "utf8"),
    );
    await scratch.exec(
      await readFile(
        "database/migrations/down/037_online_payments.sql",
        "utf8",
      ),
    );
    const gone = await scratch.query<{ t: string | null }>(
      "SELECT to_regclass('public.online_payments')::text AS t",
    );
    assert.equal(gone.rows[0].t, null);
    await migrate(scratch);
    const back = await scratch.query<{ t: string | null }>(
      "SELECT to_regclass('public.online_payments')::text AS t",
    );
    assert.equal(back.rows[0].t, "online_payments");
  } finally {
    await scratch.close();
  }
});
