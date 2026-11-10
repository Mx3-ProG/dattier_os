import { referralPricing } from "./referrals";

/** Single subscription: everything else is sold as monthly add-ons. */
export const basePlan = 39 as const;
export const plans = [
  {
    price: basePlan,
    title: "Studio",
    description:
      "Un espace adapté à votre métier : équipe, site personnalisable, visibilité, pilotage et outils métier inclus selon votre activité. Les options payantes restent à votre choix.",
    features: [
      "Espace et outils adaptés à votre métier",
      "Gestion de l’équipe",
      "Site personnalisable et référencement",
      "Pilotage, finances et rapports",
      "Fonctions métier incluses selon l’activité",
    ],
  },
] as const;

export type Plan = 0 | typeof basePlan;
/** True when the establishment holds the active subscription. */
export const subscribed = (plan: number) => plan >= basePlan;
export { additionalRestaurantPrice } from "./referrals";
/** Monthly price billed, after the referral tiers and offered establishments. */
export const monthlyPrice = (plan: Plan, seats: number, payingReferrals = 0) =>
  referralPricing(plan, seats, payingReferrals).total;

/** Cookie set by /parrainage/{code}, read when the referred customer onboards. */
export const referralCookie = "atacuisine_parrain";
