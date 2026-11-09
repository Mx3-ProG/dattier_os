/* Paiements en ligne : Dattier encaisse via Stripe Connect, retient sa commission
   et les frais estimés, puis transfère au restaurant après le délai de sécurité et
   les contrôles anti-fraude. Les appels à Stripe ont lieu hors transaction et sont
   idempotents ; les notifications sont traitées par le worker. */
import { randomBytes, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/oidc";
import { scope, type Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { one, rows, type DB } from "@/lib/database/db";
import { requireCommercialCapability } from "@/features/platform/entitlements";
import { enqueue } from "@/features/platform/jobs";
import { log, notify } from "@/features/orders/service";
import { commerce } from "@/features/commerce/service";
import { ensureDefaults } from "@/features/finance/service";
import {
  commissionBp,
  holdDays,
  liveKey,
  onlineReady,
  splitAmount,
  stripe,
  stripeEnabled,
  stripeFeeBp,
} from "./config";

/** Exécute une transaction : chaque appelant fixe son contexte et son rôle. */
export type Run = <T>(fn: (tx: DB) => Promise<T>) => Promise<T>;

type Payment = {
  id: string;
  restaurant_id: string;
  order_id: string;
  payment_intent_id: string | null;
  gross: number;
  commission: number;
  stripe_fee_estimate: number;
  net: number;
  hold_days: number;
  status: string;
  payout_id: string | null;
};
type Payout = {
  id: string;
  restaurant_id: string;
  gross: number;
  commission: number;
  stripe_fee_estimate: number;
  amount: number;
  status: string;
  stripe_transfer_id: string | null;
};

async function access(db: DB, r: string, user: Actor) {
  const scoped = await scope(db, user, r);
  requirePermission(scoped.roles ?? scoped.role, "finance");
  await requireCommercialCapability(db, r, "online-orders");
  return scoped;
}

/** Prochain versement automatique : le 1er ou le 16 du mois, à 6 h UTC. */
export function nextPayoutDate(now = new Date()) {
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth(),
    candidates = [
      Date.UTC(year, month, 1, 6),
      Date.UTC(year, month, 16, 6),
      Date.UTC(year, month + 1, 1, 6),
    ];
  return new Date(candidates.find((t) => t > now.getTime())!);
}
const schedulePayout = (db: DB, r: string, now = new Date()) => {
  const at = nextPayoutDate(now);
  return enqueue(db, r, "payout_schedule", at.toISOString(), {}, at);
};

/** Relit l’état du compte chez Stripe : seul un compte actif reçoit des fonds. */
async function refreshAccount(run: Run, r: string, accountId: string) {
  const account = await stripe().v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient"],
  });
  const capability =
    account.configuration?.recipient?.capabilities?.stripe_balance
      ?.stripe_transfers?.status;
  const status =
    capability === "active"
      ? "active"
      : capability === "restricted"
        ? "restricted"
        : "pending";
  await run(async (tx) => {
    const previous = await one<{ status: string }>(
      tx,
      "SELECT status FROM connect_accounts WHERE restaurant_id=$1",
      [r],
    );
    await tx.query(
      "UPDATE connect_accounts SET status=$2,updated_at=now() WHERE restaurant_id=$1",
      [r, status],
    );
    if (status === "active" && previous.status !== "active")
      await schedulePayout(tx, r);
  });
  return status;
}

export async function paymentsState(run: Run, r: string, user: Actor) {
  const account = await run(async (tx) => {
    await access(tx, r, user);
    return (
      await rows<{ stripe_account_id: string; status: string }>(
        tx,
        "SELECT stripe_account_id,status FROM connect_accounts WHERE restaurant_id=$1",
        [r],
      )
    )[0];
  });
  // Une panne Stripe ne doit pas masquer les versements déjà connus.
  let status = account?.status ?? "none";
  if (account && stripeEnabled())
    status = await refreshAccount(run, r, account.stripe_account_id).catch(
      () => status,
    );
  return run(async (tx) => {
    const totals = await one<Record<string, number>>(
      tx,
      `SELECT
         coalesce(sum(net) FILTER (WHERE status='paid' AND risk_status='clear' AND available_at<=now()),0)::int AS available,
         coalesce(sum(net) FILTER (WHERE status='paid' AND risk_status='clear' AND available_at>now()),0)::int AS held,
         coalesce(sum(net) FILTER (WHERE status IN ('disputed','manual_review') OR (status='paid' AND risk_status<>'clear')),0)::int AS checking,
         coalesce(sum(net) FILTER (WHERE status='released'),0)::int AS released
       FROM online_payments WHERE restaurant_id=$1`,
      [r],
    );
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    return {
      enabled: stripeEnabled(),
      live: liveKey(key),
      status,
      rates: {
        commissionBp: commissionBp(),
        stripeFeeBp: stripeFeeBp(),
        holdDays: holdDays(),
      },
      nextPayout: nextPayoutDate().toISOString(),
      totals,
      payments: await rows(
        tx,
        `SELECT p.id,p.gross,p.commission,p.stripe_fee_estimate,p.net,p.status,p.risk_status,p.paid_at,p.available_at,s.number
           FROM online_payments p JOIN shop_orders s ON s.order_id=p.order_id
          WHERE p.restaurant_id=$1 AND p.status<>'pending' ORDER BY p.created_at DESC LIMIT 50`,
        [r],
      ),
      payouts: await rows(
        tx,
        "SELECT id,amount,gross,commission,stripe_fee_estimate,status,reason,created_at,sent_at FROM online_payouts WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 30",
        [r],
      ),
    };
  });
}

export const paymentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("onboard") }),
  z.object({ action: z.literal("dashboard") }),
  z.object({ action: z.literal("request") }),
  z.object({ action: z.literal("refund"), id: z.string().min(1).max(100) }),
]);

export async function paymentAction(
  run: Run,
  r: string,
  rawUser: Actor,
  a: z.infer<typeof paymentActionSchema>,
) {
  const { user, account, name } = await run(async (tx) => {
    const scoped = await access(tx, r, rawUser);
    return {
      user: scoped,
      account: (
        await rows<{ stripe_account_id: string }>(
          tx,
          "SELECT stripe_account_id FROM connect_accounts WHERE restaurant_id=$1",
          [r],
        )
      )[0],
      name: (
        await one<{ name: string }>(
          tx,
          "SELECT name FROM restaurants WHERE id=$1",
          [r],
        )
      ).name,
    };
  });
  switch (a.action) {
    case "onboard": {
      let id = account?.stripe_account_id;
      if (!id) {
        // Le plan comptable doit exister avant la première vente en ligne.
        await run((tx) => ensureDefaults(tx, r));
        const created = await stripe().v2.core.accounts.create(
          {
            display_name: name,
            dashboard: "express",
            identity: { country: "FR" },
            defaults: {
              responsibilities: {
                fees_collector: "application",
                losses_collector: "application",
              },
            },
            configuration: {
              recipient: {
                capabilities: {
                  stripe_balance: { stripe_transfers: { requested: true } },
                },
              },
            },
          },
          { idempotencyKey: `connect-account-${r}` },
        );
        id = created.id;
        await run(async (tx) => {
          await tx.query(
            "INSERT INTO connect_accounts(restaurant_id,stripe_account_id) VALUES($1,$2) ON CONFLICT(restaurant_id) DO NOTHING",
            [r, id],
          );
          await log(tx, r, user.id, "Compte de versement créé");
        });
      }
      const back = `${appOrigin()}/dashboard?restaurant=${encodeURIComponent(r)}&module=payouts`;
      const link = await stripe().v2.core.accountLinks.create({
        account: id,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            refresh_url: back,
            return_url: back,
          },
        },
      });
      return { url: link.url };
    }
    case "dashboard": {
      if (!account) throw new Error("Aucun compte de versement.");
      const link = await stripe().accounts.createLoginLink(
        account.stripe_account_id,
      );
      return { url: link.url };
    }
    case "request": {
      if (!account) throw new Error("Aucun compte de versement.");
      const status = await refreshAccount(run, r, account.stripe_account_id);
      if (status !== "active")
        throw new Error("Le compte de versement n’est pas encore actif.");
      const payout = await run(async (tx) => {
        const created = await one<{ id: string | null }>(
          tx,
          "SELECT app.online_release_due($1,'request',$2) AS id",
          [r, user.id],
        );
        if (created.id)
          await log(tx, r, user.id, "Versement demandé", created.id);
        return created.id;
      });
      if (!payout)
        throw new Error(
          `Aucun montant disponible : une vente devient versable ${holdDays()} jours après le paiement, une fois les contrôles passés.`,
        );
      return { payout };
    }
    case "refund": {
      const payment = await run((tx) =>
        one<Payment>(
          tx,
          "SELECT * FROM online_payments WHERE id=$1 AND restaurant_id=$2",
          [a.id, r],
        ),
      );
      if (
        !payment.payment_intent_id ||
        !["paid", "released", "manual_review"].includes(payment.status)
      )
        throw new Error("Ce paiement ne peut pas être remboursé.");
      await stripe().refunds.create(
        { payment_intent: payment.payment_intent_id },
        { idempotencyKey: `refund-${payment.id}` },
      );
      await run((tx) =>
        log(tx, r, user.id, "Remboursement demandé", payment.id),
      );
      // La notification Stripe met ensuite à jour le paiement et les écritures.
      return { refunded: true };
    }
  }
}

const checkoutInput = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  path: z
    .string()
    .max(300)
    .regex(/^\/[\w\-/.]*(#[a-f0-9]{64})?$/, "Adresse de retour invalide."),
});
/** Ouvre le paiement du client. Rejouable : la même commande garde sa session. */
export async function startCheckout(run: Run, r: string, raw: unknown) {
  const input = checkoutInput.parse(raw);
  const order = await run(async (tx) => {
    const receipt = await commerce(r).receipt(tx, input.token);
    if (receipt.payment_method !== "stripe")
      throw new Error("Cette commande se règle au comptoir.");
    if (receipt.payment_status === "paid")
      throw new Error("Commande déjà réglée.");
    if (receipt.status !== "pending") throw new Error("Commande non réglable.");
    if (!(await onlineReady(tx, r)))
      throw new Error("Paiement en ligne indisponible pour cet établissement.");
    const place = await one<{ name: string; contact: string }>(
      tx,
      "SELECT r.name,o.contact FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.id=$1",
      [receipt.order_id],
    );
    return { ...receipt, ...place };
  });
  if (order.stripe_url) return { url: order.stripe_url };
  const back = `${appOrigin()}${input.path}`;
  const metadata = { restaurant: r, order: order.order_id };
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: order.total,
            product_data: {
              name: `Commande n° ${order.number} · ${order.name}`,
            },
          },
        },
      ],
      customer_email: order.contact,
      client_reference_id: order.order_id,
      success_url: back,
      cancel_url: back,
      metadata,
      payment_intent_data: { transfer_group: order.order_id, metadata },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      integration_identifier: `dattier-boutique-${randomBytes(6)
        .toString("base64url")
        .replace(/[^a-zA-Z]/g, "x")
        .slice(0, 8)}`,
    },
    { idempotencyKey: `checkout-${order.order_id}` },
  );
  await run(async (tx) => {
    const split = splitAmount(order.total);
    await tx.query(
      // Sans ON CONFLICT : il exige un droit de lecture que le canal public n’a pas.
      "INSERT INTO online_payments(id,restaurant_id,order_id,session_id,gross,commission,stripe_fee_estimate,net,hold_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        randomUUID(),
        r,
        order.order_id,
        session.id,
        order.total,
        split.commission,
        split.stripeFeeEstimate,
        split.net,
        holdDays(),
      ],
    );
    await tx.query(
      "UPDATE shop_orders SET stripe_session=$2,stripe_url=$3 WHERE order_id=$1",
      [order.order_id, session.id, session.url],
    );
  });
  return { url: session.url };
}

/** Ne garde de la notification que ce qui sert au traitement : pas de données client. */
export function minimalEvent(event: Stripe.Event) {
  const o = event.data.object as unknown as Record<string, unknown>;
  const pick = (key: string) =>
    typeof o[key] === "object" ? undefined : o[key];
  return {
    id: event.id,
    type: event.type,
    object: {
      id: o.id,
      payment_status: pick("payment_status"),
      payment_intent: o.payment_intent,
      amount_total: pick("amount_total"),
      amount: pick("amount"),
      amount_refunded: pick("amount_refunded"),
      status: pick("status"),
      order: (o.metadata as Record<string, string> | undefined)?.order,
      restaurant: (o.metadata as Record<string, string> | undefined)
        ?.restaurant,
    },
  };
}
export type MinimalEvent = ReturnType<typeof minimalEvent>;
const handled = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);
/** Dépose la notification dans la boîte d’envoi. Un rejeu Stripe n’a aucun effet. */
export async function queueEvent(
  db: DB,
  restaurant: string,
  event: MinimalEvent,
) {
  await enqueue(db, restaurant, "stripe_event", event.id, event);
}
export const isHandled = (type: string) => handled.has(type);

const paymentFor = (tx: DB, r: string, column: string, value: unknown) =>
  rows<Payment>(
    tx,
    `SELECT * FROM online_payments WHERE restaurant_id=$1 AND ${column}=$2 FOR UPDATE`,
    [r, value],
  ).then((found) => found[0]);

async function reverseSale(tx: DB, r: string, p: Payment, reason: string) {
  const declaration = await declarationId(tx, p.order_id);
  if (!declaration) return;
  const key = `payment:${declaration}`;
  const entry = (
    await rows<{ id: string }>(
      tx,
      `SELECT n.id FROM fin_entries n JOIN fin_events e ON e.id=n.event_id
        WHERE e.restaurant_id=$1 AND e.dedupe_key=$2 AND n.kind='sale_payment'
          AND NOT EXISTS(SELECT 1 FROM fin_entries x WHERE x.reverses_entry_id=n.id) LIMIT 1`,
      [r, key],
    )
  )[0];
  if (entry)
    await tx.query("SELECT app.fin_reverse_entry($1,$2,$3)", [
      r,
      entry.id,
      reason,
    ]);
  // Plus rien à comptabiliser : l’opération n’a pas à rester « à vérifier ».
  await tx.query(
    `UPDATE fin_review_items v SET status='resolved',note=$3,resolved_at=now()
       FROM fin_events e WHERE e.id=v.event_id AND v.restaurant_id=$1 AND e.dedupe_key=$2 AND v.status='open'`,
    [r, key, reason],
  );
}
const declarationId = async (tx: DB, order: string) =>
  (
    await rows<{ id: string }>(
      tx,
      "SELECT id FROM payment_declarations WHERE order_id=$1",
      [order],
    )
  )[0]?.id;

/** Retire une vente d’un versement pas encore parti : elle ne doit pas être transférée. */
async function detachFromPendingPayout(tx: DB, p: Payment) {
  if (!p.payout_id) return p;
  const payout = await one<Payout>(
    tx,
    "SELECT * FROM online_payouts WHERE id=$1 FOR UPDATE",
    [p.payout_id],
  );
  if (payout.status !== "pending") return p;
  const left = payout.amount - p.net;
  if (left > 0 && payout.gross - p.gross > 0)
    await tx.query(
      "UPDATE online_payouts SET gross=gross-$2,commission=commission-$3,stripe_fee_estimate=stripe_fee_estimate-$4,amount=amount-$5 WHERE id=$1",
      [payout.id, p.gross, p.commission, p.stripe_fee_estimate, p.net],
    );
  else
    await tx.query("UPDATE online_payouts SET status='cancelled' WHERE id=$1", [
      payout.id,
    ]);
  await tx.query("UPDATE online_payments SET payout_id=NULL WHERE id=$1", [
    p.id,
  ]);
  return { ...p, payout_id: null };
}

/** Remboursement total ou litige perdu : annule la vente et reprend le versement. */
async function cancelSale(run: Run, r: string, intent: string, reason: string) {
  const before = await run(async (tx) => {
    const found = await paymentFor(tx, r, "payment_intent_id", intent);
    if (!found || found.status === "refunded") return null;
    const p = await detachFromPendingPayout(tx, found);
    const payout = p.payout_id
      ? await one<Payout>(tx, "SELECT * FROM online_payouts WHERE id=$1", [
          p.payout_id,
        ])
      : null;
    return { p, payout };
  });
  if (!before) return;
  const { p, payout } = before;
  if (payout?.stripe_transfer_id)
    await stripe().transfers.createReversal(
      payout.stripe_transfer_id,
      { amount: p.net },
      { idempotencyKey: `reversal-${p.id}` },
    );
  await run(async (tx) => {
    await tx.query("UPDATE online_payments SET status='refunded' WHERE id=$1", [
      p.id,
    ]);
    await reverseSale(tx, r, p, reason);
    if (payout?.status === "sent") {
      const s = await one<Record<string, string>>(
        tx,
        "SELECT online_account,transfer_account,commission_account FROM fin_settings WHERE restaurant_id=$1",
        [r],
      );
      const fees = p.commission + p.stripe_fee_estimate;
      await tx.query(
        "SELECT app.fin_post_transfer($1,$2,'payout.reversed',$3,$4,'payout_reversal',$5,$6)",
        [
          r,
          `payout-reversal:${p.id}`,
          p.id,
          p.gross,
          `Reprise de versement : ${reason}`.slice(0, 200),
          JSON.stringify(
            [
              {
                account: s.online_account,
                debit: p.gross,
                credit: 0,
                label: "Vente annulée",
              },
              {
                account: s.transfer_account,
                debit: 0,
                credit: p.net,
                label: "Transfert repris",
              },
              {
                account: s.commission_account,
                debit: 0,
                credit: fees,
                label: "Commission annulée",
              },
            ].filter((l) => l.debit + l.credit > 0),
          ),
        ],
      );
    }
    await log(tx, r, null, `Vente en ligne annulée : ${reason}`, p.id);
    await notify(tx, r, `Vente en ligne annulée · ${reason}`);
  });
}

/** Traite une notification Stripe. Idempotent : Stripe et le worker peuvent la rejouer. */
export async function handleEvent(run: Run, r: string, event: MinimalEvent) {
  const o = event.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (o.payment_status === "unpaid") return;
      const intent = String(o.payment_intent);
      const details = await stripe().paymentIntents.retrieve(intent, {
        expand: ["latest_charge"],
      });
      const charge = details.latest_charge as Stripe.Charge | null;
      const level = charge?.outcome?.risk_level ?? "not_assessed";
      const orphan = await run(async (tx) => {
        const p = await paymentFor(tx, r, "session_id", o.id);
        if (!p) return null;
        // Payé après l’annulation pour non-paiement : aucune commande à servir.
        if (p.status === "expired") {
          await tx.query(
            "UPDATE online_payments SET status='manual_review',payment_intent_id=$2,paid_at=now() WHERE id=$1",
            [p.id, intent],
          );
          await notify(
            tx,
            r,
            "Paiement reçu après annulation : remboursement lancé.",
          );
          return p.id;
        }
        if (p.status !== "pending") return null;
        // Un montant inattendu ou un risque élevé attend un contrôle humain.
        const clear = level === "normal" && o.amount_total === p.gross;
        await tx.query(
          "UPDATE online_payments SET status='paid',payment_intent_id=$2,risk_level=$3,risk_status=$4,paid_at=now(),available_at=now()+make_interval(days=>$5) WHERE id=$1",
          [p.id, intent, level, clear ? "clear" : "review", p.hold_days],
        );
        await commerce(r).confirmOnline(tx, p.order_id);
        return null;
      });
      if (orphan)
        await stripe().refunds.create(
          { payment_intent: intent },
          { idempotencyKey: `refund-${orphan}` },
        );
      return;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await run(async (tx) => {
        const p = await paymentFor(tx, r, "session_id", o.id);
        if (!p || p.status !== "pending") return;
        await tx.query(
          "UPDATE online_payments SET status='expired' WHERE id=$1",
          [p.id],
        );
        await commerce(r).cancelUnpaidOnline(tx, p.order_id);
      });
      return;
    case "charge.refunded": {
      const intent = String(o.payment_intent);
      if (o.amount_refunded === o.amount)
        return cancelSale(run, r, intent, "remboursement total");
      // Remboursement partiel : rien n’est versé tant qu’un humain n’a pas tranché.
      await run(async (tx) => {
        const p = await paymentFor(tx, r, "payment_intent_id", intent);
        if (!p || p.status === "refunded") return;
        if (p.status === "paid")
          await tx.query(
            "UPDATE online_payments SET status='manual_review' WHERE id=$1",
            [p.id],
          );
        const declaration = await declarationId(tx, p.order_id);
        if (declaration)
          await tx.query("SELECT app.fin_open_review($1,$2,'correction',$3)", [
            r,
            `payment:${declaration}`,
            "Remboursement partiel en ligne : écriture et versement à corriger.",
          ]);
      });
      return;
    }
    case "charge.dispute.created":
      await run(async (tx) => {
        const found = await paymentFor(
          tx,
          r,
          "payment_intent_id",
          o.payment_intent,
        );
        if (!found || found.status === "refunded") return;
        const p = await detachFromPendingPayout(tx, found);
        await tx.query(
          "UPDATE online_payments SET status='disputed' WHERE id=$1",
          [p.id],
        );
        await notify(tx, r, "Litige bancaire ouvert sur une vente en ligne.");
      });
      return;
    case "charge.dispute.closed":
      if (o.status === "lost")
        return cancelSale(run, r, String(o.payment_intent), "litige perdu");
      await run(async (tx) => {
        const p = await paymentFor(
          tx,
          r,
          "payment_intent_id",
          o.payment_intent,
        );
        if (!p || p.status !== "disputed") return;
        await tx.query("UPDATE online_payments SET status=$2 WHERE id=$1", [
          p.id,
          p.payout_id ? "released" : "paid",
        ]);
      });
      return;
  }
}

/** Effectue le transfert d’un versement. La clé d’idempotence empêche un double envoi. */
export async function sendPayout(run: Run, r: string, payoutId: string) {
  const { payout, account } = await run(async (tx) => ({
    payout: await one<Payout>(
      tx,
      "SELECT * FROM online_payouts WHERE id=$1 AND restaurant_id=$2",
      [payoutId, r],
    ),
    account: await one<{ stripe_account_id: string }>(
      tx,
      "SELECT stripe_account_id FROM connect_accounts WHERE restaurant_id=$1",
      [r],
    ),
  }));
  if (payout.status !== "pending") return;
  if ((await refreshAccount(run, r, account.stripe_account_id)) !== "active")
    throw new Error("Compte de versement inactif : versement différé.");
  const transfer = await stripe().transfers.create(
    {
      amount: payout.amount,
      currency: "eur",
      destination: account.stripe_account_id,
      transfer_group: payout.id,
      metadata: { restaurant: r, payout: payout.id },
    },
    { idempotencyKey: `payout-${payout.id}` },
  );
  await run(async (tx) => {
    await tx.query(
      "UPDATE online_payouts SET status='sent',stripe_transfer_id=$2,sent_at=now() WHERE id=$1 AND status='pending'",
      [payout.id, transfer.id],
    );
    const s = await one<Record<string, string>>(
      tx,
      "SELECT online_account,transfer_account,commission_account FROM fin_settings WHERE restaurant_id=$1",
      [r],
    );
    const fees = payout.commission + payout.stripe_fee_estimate;
    await tx.query(
      "SELECT app.fin_post_transfer($1,$2,'payout.sent',$3,$4,'payout',$5,$6)",
      [
        r,
        `payout:${payout.id}`,
        payout.id,
        payout.gross,
        "Versement des ventes en ligne",
        JSON.stringify(
          [
            {
              account: s.transfer_account,
              debit: payout.amount,
              credit: 0,
              label: "Virement du net",
            },
            {
              account: s.commission_account,
              debit: fees,
              credit: 0,
              label: "Commission et frais",
            },
            {
              account: s.online_account,
              debit: 0,
              credit: payout.gross,
              label: "Ventes en ligne versées",
            },
          ].filter((l) => l.debit + l.credit > 0),
        ),
      ],
    );
    await log(tx, r, null, "Versement effectué", payout.id);
    await notify(tx, r, "Un versement de vos ventes en ligne est parti.");
  });
}

/** Versement automatique du 1er et du 16, puis programmation du suivant. */
export async function runScheduledPayout(run: Run, r: string) {
  await run(async (tx) => {
    await tx.query("SELECT app.online_release_due($1,'schedule',NULL)", [r]);
    await schedulePayout(tx, r);
  });
}

/** Commande abandonnée sans session Stripe aboutie : libère le stock réservé. */
export async function expireUnpaid(run: Run, r: string, order: string) {
  await run(async (tx) => {
    await commerce(r).cancelUnpaidOnline(tx, order);
    await tx.query(
      "UPDATE online_payments SET status='expired' WHERE order_id=$1 AND status='pending'",
      [order],
    );
  });
}
