import { saasLive } from "@/features/billing/stripe-saas";
/** Minimal Stripe contract so cancellation can be tested without credentials or network. */
type Subscription = {
  id: string;
  livemode: boolean;
  status: string;
  metadata: Record<string, string>;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  items: {
    data: {
      price: { id: string };
      quantity?: number;
      current_period_end: number;
    }[];
  };
};
type Gateway = {
  retrieve(id: string): Promise<Subscription>;
  update(
    id: string,
    params: { cancel_at_period_end: true },
  ): Promise<Subscription>;
};
export function renewalStopped(
  subscription: Pick<
    Subscription,
    "cancel_at_period_end" | "cancel_at" | "items"
  >,
) {
  const end = subscription.items.data[0]?.current_period_end;
  return (
    subscription.cancel_at_period_end ||
    (subscription.cancel_at !== null &&
      Number.isFinite(end) &&
      subscription.cancel_at <= end)
  );
}
function verify(
  subscription: Subscription,
  order: { id: string; stripe_subscription: string },
  price: string,
) {
  const item = subscription.items.data[0];
  if (
    !price ||
    subscription.id !== order.stripe_subscription ||
    subscription.livemode !== saasLive() ||
    subscription.metadata.addon_order !== order.id ||
    subscription.items.data.length !== 1 ||
    item.price.id !== price ||
    item.quantity !== 1 ||
    !Number.isFinite(item.current_period_end) ||
    item.current_period_end <= 0
  )
    throw new Error("Abonnement incompatible.");
  if (subscription.status !== "active")
    throw new Error("Cet abonnement n’est plus actif. Actualisez vos add-ons.");
}
/** Never extend an already scheduled cancellation; never request immediate cancellation. */
export async function stopAddonRenewal(
  gateway: Gateway,
  order: { id: string; stripe_subscription: string },
  price: string,
) {
  const before = await gateway.retrieve(order.stripe_subscription);
  verify(before, order, price);
  if (renewalStopped(before)) return;
  const after = await gateway.update(order.stripe_subscription, {
    cancel_at_period_end: true,
  });
  verify(after, order, price);
  if (!renewalStopped(after))
    throw new Error(
      "L’arrêt du renouvellement n’a pas été confirmé. Réessayez.",
    );
}
