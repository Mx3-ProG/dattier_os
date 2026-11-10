/**
 * Referral program rules. The database mirrors the tier and the challenge in
 * database/migrations/075_single_plan.sql (app.referral_bonus_plan) and
 * 024_referral_rewards.sql (app.referral_plan_changed): change both together.
 */
export type PaidPlan = 39;

/** Paying referrals that make the subscription free. */
export const freeThreshold: Record<PaidPlan, number> = { 39: 3 };
/** Beyond the free tier, every this many referrals offers one extra establishment. */
export const extraSeatEvery = 3;
export const additionalRestaurantPrice = 39;
/** Calendar-month challenge: this many activations in the month → months offered. */
export const monthlyChallenge = { target: 2, months: 1 } as const;

export const levels = [
  { name: "Bronze", min: 1 },
  { name: "Argent", min: 3 },
  { name: "Or", min: 5 },
  { name: "Platine", min: 10 },
  { name: "Légende", min: 20 },
] as const;

/** Plan unlocked by referrals (0 when none). */
export function bonusPlan(paying: number): 0 | PaidPlan {
  return paying >= freeThreshold[39] ? 39 : 0;
}

export function referralPricing(plan: 0 | PaidPlan, seats: number, paying = 0) {
  const extraSeats = Math.max(seats - 1, 0);
  if (plan === 0)
    return { gross: 0, base: 0, free: false, freeSeats: 0, extraBilled: 0, total: 0, accessPlan: 0 as const, nextGoal: null };
  const threshold = freeThreshold[plan];
  const free = paying >= threshold;
  const freeSeats = free
    ? Math.min(Math.floor((paying - threshold) / extraSeatEvery), extraSeats)
    : 0;
  const extraBilled = (extraSeats - freeSeats) * additionalRestaurantPrice;
  const base = free ? 0 : plan;
  // Next milestone: the free tier, then the next free establishment.
  const nextGoal = !free
    ? { kind: "free" as const, target: threshold, plan }
    : freeSeats < extraSeats
      ? { kind: "seat" as const, target: threshold + (freeSeats + 1) * extraSeatEvery, plan }
      : null;
  return {
    gross: plan + extraSeats * additionalRestaurantPrice,
    base,
    free,
    freeSeats,
    extraBilled,
    total: base + extraBilled,
    accessPlan: plan,
    nextGoal,
  };
}

/** Levels are earned for life, from referrals that paid at least once. */
export function referralLevel(activated: number) {
  const reached = levels.filter((level) => activated >= level.min);
  const current = reached.at(-1) ?? null;
  const next = levels.find((level) => activated < level.min) ?? null;
  const from = current?.min ?? 0;
  return {
    current,
    next,
    progress: next ? (activated - from) / (next.min - from) : 1,
  };
}
