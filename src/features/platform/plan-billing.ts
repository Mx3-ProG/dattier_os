/**
 * Monthly Studio subscription through Stripe Checkout (live or test keys).
 *
 * Separate credentials from merchant payments (Stripe Connect) and from the
 * add-on test billing. The database is only updated by the billing role, from
 * the subscription re-read on Stripe, never from a browser-supplied value.
 */
import Stripe from "stripe";
import { Pool } from "pg";
import { authenticated } from "./http";
import { basePlan } from "./pricing";
import { appOrigin } from "@/lib/auth/oidc";
import { one, type DB } from "@/lib/database/db";

const grantingStatuses = new Set(["active", "trialing", "past_due"]);
const planAmountCents = basePlan * 100;

const secretKey = () => process.env.STUDIO_PLAN_STRIPE_SECRET_KEY ?? "";
export const planPriceId = () => process.env.STUDIO_PLAN_PRICE_ID ?? "";

/** True when visitors can be sent to the monthly subscription checkout. */
export function planBillingReady() {
  return (
    /^(sk|rk)_(live|test)_/.test(secretKey()) &&
    /^price_/.test(planPriceId()) &&
    !!process.env.STUDIO_BILLING_DATABASE_URL
  );
}

let client: Stripe | undefined;
export function planStripe() {
  if (!planBillingReady()) throw new Error("Abonnement en ligne non configuré.");
  client ??= new Stripe(secretKey(), { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

export function planWebhookEvent(raw: string, signature: string) {
  const secret = process.env.STUDIO_PLAN_STRIPE_WEBHOOK_SECRET;
  if (!secret || !planBillingReady()) throw new Error("Notifications d’abonnement non configurées.");
  return Stripe.webhooks.constructEvent(raw, signature, secret);
}

type BillingContext = {
  owner: boolean;
  stripe_customer: string | null;
  stripe_subscription: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  paid_plan: number;
};
export const billingContext = (db: DB, organization: string) =>
  one<BillingContext>(db, "SELECT * FROM app.plan_billing_context($1)", [organization]);

async function assertPlanPrice(stripe: Stripe) {
  const price = await stripe.prices.retrieve(planPriceId());
  if (
    !price.active ||
    price.currency !== "eur" ||
    price.unit_amount !== planAmountCents ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  )
    throw new Error(`Le tarif Stripe doit être de ${basePlan} € par mois.`);
  return price;
}

/** Opens a Stripe Checkout page for the organization owner. */
export async function planCheckout(organization: string) {
  const stripe = planStripe();
  const price = await assertPlanPrice(stripe);
  const { context, email } = await authenticated(undefined, async (db, user) => ({
    context: await billingContext(db, organization),
    email: user.email,
  }));
  if (!context.owner) throw new Error("Abonnement réservé au propriétaire de l’organisation.");
  if (grantingStatuses.has(context.status))
    throw new Error("Cette organisation a déjà un abonnement en cours.");
  // Keep the remaining free days when Stripe allows it (trial end ≥ 48 h ahead).
  const trialEnd = context.trial_ends_at && !context.paid_plan
    ? Math.floor(Date.parse(context.trial_ends_at) / 1000)
    : 0;
  const keepTrial = trialEnd > Math.floor(Date.now() / 1000) + 49 * 3600;
  const origin = appOrigin();
  const metadata = { studio_plan_org: organization };
  const automaticTax = process.env.STUDIO_PLAN_AUTOMATIC_TAX === "true";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    ...(context.stripe_customer
      ? { customer: context.stripe_customer, ...(automaticTax ? { customer_update: { address: "auto" as const } } : {}) }
      : email ? { customer_email: email } : {}),
    client_reference_id: organization,
    metadata,
    subscription_data: { metadata, ...(keepTrial ? { trial_end: trialEnd } : {}) },
    allow_promotion_codes: true,
    ...(automaticTax ? { automatic_tax: { enabled: true } } : {}),
    locale: "fr",
    success_url: `${origin}/abonnement/retour?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/platform?abonnement=annule`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  await authenticated(undefined, (db) =>
    db.query("SELECT app.plan_record_session($1,$2,$3)", [
      organization,
      session.id,
      context.stripe_customer,
    ]),
  );
  if (!session.url) throw new Error("Page de paiement indisponible.");
  return { url: session.url };
}

/** Stripe customer portal: payment method, invoices, cancellation. */
export async function planPortal(organization: string) {
  const stripe = planStripe();
  const context = await authenticated(undefined, (db) => billingContext(db, organization));
  if (!context.owner || !context.stripe_customer)
    throw new Error("Aucun abonnement Stripe à gérer pour cette organisation.");
  const portal = await stripe.billingPortal.sessions.create({
    customer: context.stripe_customer,
    return_url: `${appOrigin()}/platform`,
    locale: "fr",
  });
  return { url: portal.url };
}

/** Stops renewal at the end of the paid period; access stays until then. */
export async function planCancelAtPeriodEnd(organization: string) {
  const stripe = planStripe();
  const context = await authenticated(undefined, (db) => billingContext(db, organization));
  if (!context.owner) throw new Error("Résiliation non autorisée.");
  if (!context.stripe_subscription || !grantingStatuses.has(context.status)) return false;
  await stripe.subscriptions.update(context.stripe_subscription, { cancel_at_period_end: true });
  await reconcilePlanSubscription(context.stripe_subscription);
  return true;
}

async function withBillingDb<T>(fn: (query: Pool["query"]) => Promise<T>) {
  const pool = new Pool({
    connectionString: process.env.STUDIO_BILLING_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    return await fn(pool.query.bind(pool) as Pool["query"]);
  } finally {
    await pool.end();
  }
}

/** Re-reads a subscription on Stripe and applies its state to the organization. */
export async function reconcilePlanSubscription(subscriptionId: string) {
  const stripe = planStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const organization = sub.metadata?.studio_plan_org;
  if (!organization) return null; // Not a Studio plan subscription.
  const item = sub.items.data[0];
  if (sub.items.data.length !== 1 || item.price.id !== planPriceId())
    throw new Error("Abonnement incompatible avec le forfait Studio.");
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await withBillingDb((query) =>
    query("SELECT app.plan_reconcile($1,$2,$3,$4,$5,$6,$7)", [
      organization,
      customer,
      sub.id,
      sub.status,
      item.current_period_end ? new Date(item.current_period_end * 1000) : null,
      Boolean(sub.cancel_at_period_end || sub.cancel_at),
      sub.livemode,
    ]),
  );
  return { organization, status: sub.status };
}

/** Return from Checkout: activates immediately, even before the webhook. */
export async function reconcilePlanSession(sessionId: string) {
  if (!/^cs_[A-Za-z0-9_]{8,250}$/.test(sessionId)) throw new Error("Session invalide.");
  const stripe = planStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const organization = session.metadata?.studio_plan_org;
  if (!organization) throw new Error("Session incompatible.");
  // Only a member of that organization may trigger this refresh.
  await authenticated(undefined, (db) => billingContext(db, organization));
  if (session.status !== "complete" || !session.subscription) return { organization, status: session.status };
  const subscription = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  return reconcilePlanSubscription(subscription);
}

/** Subscription id carried by any subscription-related Stripe event object. */
export function subscriptionOf(event: Stripe.Event) {
  const object = event.data.object as unknown as {
    object?: string;
    id?: string;
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  };
  if (object.object === "subscription") return object.id ?? null;
  const ref = object.subscription ?? object.parent?.subscription_details?.subscription ?? null;
  return typeof ref === "string" ? ref : ref?.id ?? null;
}
