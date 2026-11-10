import { Pool } from "pg";
import type Stripe from "stripe";
import { addonBillingReady, addonStripe } from "./billing-config";

/**
 * Réconciliation des achats uniques. Chaque notification relit l’état Stripe
 * courant sous verrou : doublons et désordre des webhooks n’ont donc aucun effet.
 * Règles commerciales appliquées : voir docs/platform/studio-os/BOUTIQUE-ADDONS.md.
 */
export const purchaseCheckoutReady = () =>
  addonBillingReady() && !!process.env.STUDIO_BILLING_DATABASE_URL;

export type PurchaseFacts = {
  livemode: boolean;
  orderReference: string | undefined;
  mode: string | null;
  sessionStatus: string | null;
  paymentStatus: string;
  amountSubtotal: number | null;
  currency: string | null;
  paymentIntent: string | null;
  chargeAmount: number;
  amountRefunded: number;
  disputes: readonly string[];
};
export type PurchaseOrder = {
  id: string;
  status: string;
  amount_cents: number;
  currency: string;
  stripe_session: string | null;
};
export type PurchaseOutcome = {
  status: "paid" | "expired" | "refunded" | "disputed" | "dispute_lost" | null;
  refunded: number;
};
/** Fonction pure : un état Stripe incohérent avec la commande bloque toute attribution. */
export function derivePurchaseOutcome(order: PurchaseOrder, facts: PurchaseFacts): PurchaseOutcome {
  if (facts.livemode || facts.orderReference !== order.id || facts.mode !== "payment")
    throw new Error("Session incompatible.");
  if (facts.sessionStatus === "expired") return { status: "expired", refunded: 0 };
  if (facts.sessionStatus !== "complete" || facts.paymentStatus !== "paid")
    return { status: null, refunded: 0 };
  if (facts.amountSubtotal !== order.amount_cents || facts.currency !== order.currency)
    throw new Error("Montant incompatible.");
  const refunded = facts.amountRefunded;
  if (facts.chargeAmount > 0 && refunded >= facts.chargeAmount)
    return { status: "refunded", refunded };
  if (facts.disputes.includes("lost")) return { status: "dispute_lost", refunded };
  if (facts.disputes.some((status) => !["won", "lost", "warning_closed", "prevented"].includes(status)))
    return { status: "disputed", refunded };
  return { status: "paid", refunded };
}

export type PurchaseGateway = {
  facts(sessionId: string): Promise<PurchaseFacts>;
  refund(paymentIntent: string, orderId: string): Promise<void>;
};
export function stripeGateway(stripe: Stripe = addonStripe()): PurchaseGateway {
  return {
    async facts(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent.latest_charge"],
      });
      const intent = session.payment_intent as Stripe.PaymentIntent | string | null;
      const intentId = typeof intent === "string" ? intent : (intent?.id ?? null);
      const charge =
        intent && typeof intent !== "string" && intent.latest_charge && typeof intent.latest_charge !== "string"
          ? intent.latest_charge
          : null;
      const disputes = intentId
        ? await stripe.disputes.list({ payment_intent: intentId, limit: 20 })
        : { data: [] };
      return {
        livemode: session.livemode,
        orderReference: session.metadata?.addon_purchase,
        mode: session.mode,
        sessionStatus: session.status,
        paymentStatus: session.payment_status,
        amountSubtotal: session.amount_subtotal,
        currency: session.currency,
        paymentIntent: intentId,
        chargeAmount: charge?.amount ?? 0,
        amountRefunded: charge?.amount_refunded ?? 0,
        disputes: disputes.data.map((dispute) => dispute.status),
      };
    },
    async refund(paymentIntent, orderId) {
      await stripe.refunds.create(
        { payment_intent: paymentIntent, reason: "duplicate", metadata: { addon_purchase: orderId } },
        { idempotencyKey: `addon-purchase-duplicate:${orderId}` },
      );
    },
  };
}

type Queryable = { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };
/** Corps transactionnel, sans dépendance à la connexion : exécuté sous verrou de la commande. */
export async function reconcilePurchaseOn(tx: Queryable, gateway: PurchaseGateway, orderId: string) {
  const { rows } = await tx.query("SELECT * FROM app.addon_purchase_lock($1)", [orderId]);
  const order = rows[0] as PurchaseOrder | undefined;
  if (!order?.stripe_session) return { status: order?.status ?? null, refundIntent: null };
  const facts = await gateway.facts(order.stripe_session);
  const outcome = derivePurchaseOutcome(order, facts);
  if (!outcome.status) return { status: order.status, refundIntent: null };
  const result = await tx.query("SELECT app.addon_purchase_apply($1,$2,$3,$4,$5) AS status", [
    order.id,
    order.stripe_session,
    facts.paymentIntent,
    outcome.status,
    outcome.refunded,
  ]);
  const status = (result.rows[0] as { status: string }).status;
  return { status, refundIntent: status === "duplicate" ? facts.paymentIntent : null };
}

async function withBillingClient<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const connection = process.env.STUDIO_BILLING_DATABASE_URL;
  if (!connection) throw new Error("Connexion de facturation indisponible.");
  const pool = new Pool({ connectionString: connection, max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
export async function reconcilePurchase(orderId: string, gateway: PurchaseGateway = stripeGateway()) {
  const result = await withBillingClient((tx) => reconcilePurchaseOn(tx, gateway, orderId));
  // Remboursement après validation : un échec est rejoué par Stripe sans effet de bord en double.
  if (result.refundIntent) await gateway.refund(result.refundIntent, orderId);
  return result.status;
}
export async function reconcilePurchaseByIntent(paymentIntent: string) {
  const orderId = await withBillingClient(async (tx) => {
    const { rows } = await tx.query("SELECT app.addon_purchase_by_intent($1) AS id", [paymentIntent]);
    return (rows[0] as { id: string | null } | undefined)?.id ?? null;
  });
  // Un PaymentIntent inconnu concerne les abonnements existants : rien à faire ici.
  if (orderId) await reconcilePurchase(orderId);
}
