import Stripe from "stripe";

/** Separate SaaS billing credentials: never reuse merchant payments or accept a live key here. */
export function addonBillingReady() {
  return /^(sk|rk)_test_/.test(process.env.STUDIO_BILLING_STRIPE_SECRET_KEY ?? "") &&
    !!process.env.STUDIO_BILLING_STRIPE_WEBHOOK_SECRET;
}
export function addonStripe() {
  const key = process.env.STUDIO_BILLING_STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_test_/.test(key))
    throw new Error("La facturation des add-ons nécessite une clé Stripe de test.");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
}
export function addonWebhook(raw: string, signature: string) {
  if (!addonBillingReady()) throw new Error("Facturation des add-ons non configurée.");
  const event = Stripe.webhooks.constructEvent(raw, signature, process.env.STUDIO_BILLING_STRIPE_WEBHOOK_SECRET!);
  if (event.livemode) throw new Error("Les paiements réels ne sont pas autorisés pour les add-ons.");
  return event;
}
