import { basePlan } from "./pricing";

// Display configuration reused from the existing Black Friday campaign.
export const blackFriday = {
  code: "BLACKFRIDAY",
  endsAt: "2026-11-22T00:00:00+01:00",
  discount: 30,
  months: 3,
  trialDays: 7,
} as const;

/**
 * Code promo Stripe live BLACKFRIDAY (30 € pendant 3 mois, expire le 22/11 à 00:00),
 * pré-appliqué au paiement de l’abonnement Studio pendant l’offre.
 * STUDIO_PLAN_PROMOTION_CODE permet d’en brancher un autre sans redéployer le code.
 */
export const promotionCodeId = () =>
  process.env.STUDIO_PLAN_PROMOTION_CODE || "promo_1UbcliApai8VVkXiYrVIX4en";

export type Promotion = typeof blackFriday & { price: number; lastDay: string };

/** L’offre en cours, ou null une fois la date de fin passée. */
export function activePromotion(now = new Date()): Promotion | null {
  if (now.getTime() >= Date.parse(blackFriday.endsAt)) return null;
  return { ...blackFriday, price: basePlan - blackFriday.discount, lastDay: "samedi 21 novembre" };
}

