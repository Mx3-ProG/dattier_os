import Stripe from "stripe";
import { saasKeyValid, saasStripe, saasWebhookSecret, assertSameMode } from "@/features/billing/stripe-saas";

/** SaaS billing credentials (live or test), never the merchant Stripe Connect key. */
export function addonBillingReady() {
  return saasKeyValid() && !!saasWebhookSecret();
}
export function addonStripe() {
  return saasStripe();
}
export function addonWebhook(raw: string, signature: string) {
  if (!addonBillingReady()) throw new Error("Facturation des add-ons non configurée.");
  const event = Stripe.webhooks.constructEvent(raw, signature, saasWebhookSecret());
  assertSameMode(event);
  return event;
}
