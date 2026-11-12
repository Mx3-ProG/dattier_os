/** Only the first card-backed subscription gets an introductory trial. */
export function subscriptionTrial(context: {
  stripe_subscription: string | null; status: string; paid_plan: number; trial_ends_at: string | null;
}) {
  return !context.stripe_subscription && !context.paid_plan && context.trial_ends_at &&
    ["none", "pending"].includes(context.status)
    ? { trial_period_days: 7, trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } }
    : {};
}
export function validateCapacity(current: number, requested: number) {
  if (!Number.isInteger(requested) || requested <= current || requested > 100)
    throw new Error("Choisissez un nombre de places supérieur à votre capacité actuelle (maximum 100).");
  return requested;
}
