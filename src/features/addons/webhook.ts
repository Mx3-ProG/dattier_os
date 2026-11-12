import type Stripe from "stripe";
import { reconcilePurchase, reconcilePurchaseByIntent } from "./purchases";
import { reconcileAddon } from "./service";
import { reconcileStudioCredit, reconcileStudioCreditByIntent } from "@/features/credits/studio";

const subscriptionEvents = ["customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"];
const sessionEvents = ["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"];
const chargeEvents = ["charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"];
export const addonEventTypes = [...subscriptionEvents, ...sessionEvents, ...chargeEvents];

/** Applies a verified Stripe event to add-on subscriptions, purchases and credits. */
export async function handleAddonEvent(event: Stripe.Event) {
  if (!addonEventTypes.includes(event.type)) return false;
  const object = event.data.object as unknown as {
    metadata?: Record<string, string>;
    payment_intent?: string | { id: string } | null;
    parent?: { subscription_details?: { metadata?: Record<string, string> } };
  };
  if (chargeEvents.includes(event.type)) {
    const intent = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id;
    if (intent) {
      await reconcilePurchaseByIntent(intent);
      await reconcileStudioCreditByIntent(intent);
    }
    return true;
  }
  if (object.metadata?.studio_credit_order) { await reconcileStudioCredit(object.metadata.studio_credit_order); return true; }
  if (object.metadata?.addon_purchase) { await reconcilePurchase(object.metadata.addon_purchase); return true; }
  const id = object.metadata?.addon_order ?? object.parent?.subscription_details?.metadata?.addon_order;
  if (id) { await reconcileAddon(id); return true; }
  return false;
}
