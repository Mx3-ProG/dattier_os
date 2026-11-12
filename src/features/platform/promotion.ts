import { basePlan } from "./pricing";

/**
 * Offre Black Friday, affichée et appliquée jusqu’au lundi 16 novembre 2026 à
 * minuit (heure de Paris) : essai de 7 jours au lieu de 3, et code promo Stripe
 * BLACKFRIDAY (30 € de remise par mois pendant 3 mois, soit 9 € au lieu de 39 €).
 *
 * Le code se crée dans Stripe (coupon « répétitif » 3 mois, montant 30 €, EUR,
 * puis code promo BLACKFRIDAY expirant à la même date). La date de fin est aussi
 * écrite dans la migration 170 pour la durée d’essai : garder les deux alignées.
 */
export const blackFriday = {
  code: "BLACKFRIDAY",
  endsAt: "2026-11-17T00:00:00+01:00",
  discount: 30,
  months: 3,
  trialDays: 7,
} as const;

export const standardTrialDays = 7;

export type Promotion = typeof blackFriday & { price: number; lastDay: string };

/** L’offre en cours, ou null une fois la date de fin passée. */
export function activePromotion(now = new Date()): Promotion | null {
  if (now.getTime() >= Date.parse(blackFriday.endsAt)) return null;
  return { ...blackFriday, price: basePlan - blackFriday.discount, lastDay: "lundi 16 novembre" };
}

/** Durée de l’essai gratuit pour un espace créé maintenant. */
export const trialDays = (now = new Date()) =>
  activePromotion(now) ? blackFriday.trialDays : standardTrialDays;
