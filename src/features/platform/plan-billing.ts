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
import { subscriptionTrial } from "./billing-rules";
import { appOrigin } from "@/infrastructure/auth/oidc";
import { one, type DB } from "@/infrastructure/database/db";
import { assertSameMode, resolveMonthlyPrice, saasAutomaticTax, saasReady, saasStripe, saasWebhookSecret } from "@/features/billing/stripe-saas";

const grantingStatuses = new Set(["active", "trialing", "past_due"]);
const planAmountCents = basePlan * 100;

/** Monthly Studio price: env override, else the "Exploitation" product of the catalog. */
export const planPriceId = () =>
  resolveMonthlyPrice({
    env: "STUDIO_PLAN_PRICE_ID",
    names: ["Exploitation", "Studio", "STUDIO OS", "Abonnement Studio"],
    product: process.env.STUDIO_PLAN_PRODUCT_ID || "prod_VZZaLSq8yVya1u",
    cents: planAmountCents,
  });

/** True when visitors can be sent to the monthly subscription checkout. */
export const planBillingReady = saasReady;
export const planStripe = saasStripe;

export function planWebhookEvent(raw: string, signature: string) {
  const secret = saasWebhookSecret();
  if (!secret || !planBillingReady()) throw new Error("Notifications d’abonnement non configurées.");
  const event = Stripe.webhooks.constructEvent(raw, signature, secret);
  assertSameMode(event);
  return event;
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
  const price = await stripe.prices.retrieve(await planPriceId());
  assertSameMode(price);
  if (
    !price.active ||
    price.currency !== "eur" ||
    price.unit_amount !== planAmountCents ||
    price.tax_behavior === "exclusive" ||
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
  const { context, email, previousSession } = await authenticated(undefined, async (db, user) => ({
    context: await billingContext(db, organization),
    email: user.email,
    previousSession: (await one<{id:string|null}>(db,"SELECT app.plan_checkout_session($1) AS id",[organization])).id,
  }));
  if (!context.owner) throw new Error("Abonnement réservé au propriétaire de l’organisation.");
  if (grantingStatuses.has(context.status))
    throw new Error("Cette organisation a déjà un abonnement en cours.");
  if(previousSession) {
    const previous=await stripe.checkout.sessions.retrieve(previousSession);
    assertSameMode(previous);
    if(previous.status==="open" && previous.url) return {url:previous.url};
    if(previous.status==="complete" && !["canceled","unpaid","incomplete_expired"].includes(context.status)) {
      await reconcilePlanSession(previousSession);
      throw new Error("Une souscription a déjà été effectuée. Actualisez votre espace.");
    }
  }
  const origin = appOrigin();
  const metadata = { studio_plan_org: organization };
  const automaticTax = saasAutomaticTax();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    ...(context.stripe_customer
      ? { customer: context.stripe_customer, ...(automaticTax ? { customer_update: { address: "auto" as const } } : {}) }
      : email ? { customer_email: email } : {}),
    client_reference_id: organization,
    metadata,
    subscription_data: { metadata, ...subscriptionTrial(context) },
    allowed_payment_method_types: ["card"],
    // The card is always registered, even when the first charge waits for the trial end.
    payment_method_collection: "always",
    allow_promotion_codes: true,
    ...(automaticTax ? { automatic_tax: { enabled: true } } : {}),
    locale: "fr",
    success_url: `${origin}/abonnement/retour?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/platform?abonnement=annule`,
  }, {idempotencyKey:`studio-plan:${organization}:${previousSession||"first"}`});
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
    ...(process.env.STUDIO_STRIPE_PORTAL_CONFIGURATION
      ? { configuration: process.env.STUDIO_STRIPE_PORTAL_CONFIGURATION }
      : {}),
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
  const client = await pool.connect();
  try {
    return await fn(client.query.bind(client) as Pool["query"]);
  } finally {
    client.release();
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
  assertSameMode(sub);
  if (sub.items.data.length !== 1 || item.price.id !== (await planPriceId()))
    throw new Error("Abonnement incompatible avec le forfait Studio.");
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await withBillingDb(async (query) => {
    await query("BEGIN");
    try {
      await query("SELECT app.plan_reconcile($1,$2,$3,$4,$5,$6,$7)", [
        organization, customer, sub.id, sub.status,
        item.current_period_end ? new Date(item.current_period_end * 1000) : null,
        Boolean(sub.cancel_at_period_end || sub.cancel_at), sub.livemode,
      ]);
      await query("SELECT app.plan_reconcile_details($1,$2,$3,$4,$5)", [
        organization, sub.id, item.quantity ?? 1,
        sub.trial_start ? new Date(sub.trial_start * 1000) : null,
        sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      ]);
      await query("COMMIT");
    } catch (error) { await query("ROLLBACK"); throw error; }
  });
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
