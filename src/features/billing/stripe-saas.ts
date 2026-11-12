/**
 * Stripe account billing STUDIO OS itself (subscription, add-ons, credits).
 * Distinct from merchant payments (Stripe Connect). One key, live or test:
 * every Stripe object must belong to the same mode as that key.
 */
import Stripe from "stripe";

export function saasStripeKey() {
  return (
    process.env.STUDIO_BILLING_STRIPE_SECRET_KEY ||
    process.env.STUDIO_PLAN_STRIPE_SECRET_KEY ||
    ""
  );
}
export function saasWebhookSecret() {
  return (
    process.env.STUDIO_BILLING_STRIPE_WEBHOOK_SECRET ||
    process.env.STUDIO_PLAN_STRIPE_WEBHOOK_SECRET ||
    ""
  );
}
export const saasKeyValid = () => /^(sk|rk)_(live|test)_/.test(saasStripeKey());
/** True with a live key: test objects are then refused, and the reverse. */
export const saasLive = () => /^(sk|rk)_live_/.test(saasStripeKey());
export const saasReady = () =>
  saasKeyValid() && !!saasWebhookSecret() && !!process.env.STUDIO_BILLING_DATABASE_URL;
/** Stripe Tax only when explicitly configured on the Stripe account. */
export const saasAutomaticTax = () =>
  process.env.STUDIO_STRIPE_AUTOMATIC_TAX === "true" ||
  process.env.STUDIO_PLAN_AUTOMATIC_TAX === "true";

let client: Stripe | undefined;
let clientKey = "";
export function saasStripe() {
  const key = saasStripeKey();
  if (!saasKeyValid()) throw new Error("Paiement en ligne non configuré.");
  if (!client || clientKey !== key) {
    client = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
    clientKey = key;
  }
  return client;
}
export function assertSameMode(object: { livemode: boolean }) {
  if (object.livemode !== saasLive()) throw new Error("Objet Stripe d’un autre mode.");
}

type PriceRule = {
  /** Explicit override, e.g. STUDIO_ADDON_QR_PRICE_ID. */
  env: string;
  /** Product names accepted in the Stripe catalog (exact match, case-insensitive). */
  names: string[];
  /** Product id accepted without a name match. */
  product?: string;
  cents: number;
};

const cache = new Map<string, { id: string; at: number }>();
const ttl = 10 * 60 * 1000;

/**
 * Finds the active monthly EUR price for a product of the STUDIO OS catalog.
 * Avoids one environment variable per add-on: the Stripe catalog is the source.
 */
export async function resolveMonthlyPrice(rule: PriceRule) {
  const override = process.env[rule.env];
  if (override) return override;
  const hit = cache.get(rule.env);
  if (hit && Date.now() - hit.at < ttl) return hit.id;
  const stripe = saasStripe();
  const names = rule.names.map((name) => name.toLowerCase());
  for await (const price of stripe.prices.list({
    active: true,
    type: "recurring",
    currency: "eur",
    limit: 100,
    expand: ["data.product"],
  })) {
    const product = price.product as Stripe.Product | Stripe.DeletedProduct;
    if (!product || ("deleted" in product && product.deleted)) continue;
    const named = "name" in product && names.includes(product.name.trim().toLowerCase());
    if (
      (named || product.id === rule.product) &&
      ("active" in product ? product.active : true) &&
      price.unit_amount === rule.cents &&
      price.recurring?.interval === "month" &&
      price.recurring.interval_count === 1 &&
      price.livemode === saasLive()
    ) {
      cache.set(rule.env, { id: price.id, at: Date.now() });
      return price.id;
    }
  }
  throw new Error("Tarif introuvable dans le catalogue Stripe.");
}
