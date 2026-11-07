/**
 * Referral program rules. The database mirrors the tiers and the challenge in
 * database/migrations/024_referral_rewards.sql (app.referral_bonus_plan and
 * app.referral_plan_changed): change both together.
 */
export type PaidPlan = 39 | 69 | 99;

/** Paying referrals that make each plan free (and unlock it for lower plans). */
export const freeThreshold: Record<PaidPlan, number> = { 39: 3, 69: 5, 99: 10 };
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

const paidPlans: PaidPlan[] = [39, 69, 99];

/** Highest plan unlocked by referrals (0 when none). */
export function bonusPlan(paying: number): 0 | PaidPlan {
  let unlocked: 0 | PaidPlan = 0;
  for (const plan of paidPlans) if (paying >= freeThreshold[plan]) unlocked = plan;
  return unlocked;
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
  const accessPlan = Math.max(plan, bonusPlan(paying)) as PaidPlan;
  // Next milestone: the free tier, then the next unlocked plan, then the next free establishment.
  const higher = paidPlans.find((p) => p > accessPlan);
  const nextGoal = !free
    ? { kind: "free" as const, target: threshold, plan }
    : higher
      ? { kind: "upgrade" as const, target: freeThreshold[higher], plan: higher }
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
    accessPlan,
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
