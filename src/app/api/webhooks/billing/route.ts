import { NextRequest } from "next/server";
import { json } from "@/features/platform/http";
import {
  planWebhookEvent,
  reconcilePlanSubscription,
  subscriptionOf,
} from "@/features/platform/plan-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handled = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

/**
 * Signed Stripe notifications for the Studio subscription. The event payload
 * is only a hint: the subscription is re-read on Stripe before any change.
 */
export async function POST(req: NextRequest) {
  let event;
  try {
    const raw = await req.text();
    if (raw.length > 1_000_000) return json({ error: "Notification trop volumineuse." }, 413);
    event = planWebhookEvent(raw, req.headers.get("stripe-signature") || "");
  } catch {
    return json({ error: "Signature refusée." }, 400);
  }
  if (!handled.has(event.type)) return json({ received: true });
  try {
    const subscription = subscriptionOf(event);
    if (subscription) await reconcilePlanSubscription(subscription);
    return json({ received: true });
  } catch (error) {
    console.error("[billing] Notification", event.type, error instanceof Error ? error.message : error);
    // 500: Stripe retries automatically.
    return json({ error: "Notification non traitée ; Stripe réessaiera." }, 500);
  }
}
