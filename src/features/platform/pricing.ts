import { referralPricing } from "./referrals";

/** Single subscription: everything else is sold as monthly add-ons. */
export const basePlan = 39 as const;
export const plans = [
  {
    price: basePlan,
    title: "Studio",
    description:
      "Salle, réservations, commandes, carte, stocks, achats, équipe, site personnalisable, référencement, finances et rapports, boutique en ligne avec panier, créneaux et règlement au comptoir.",
    features: [
      "Salle et réservations",
      "Commandes, carte et stocks",
      "Achats et équipe",
      "Site personnalisable et référencement",
      "Finances et rapports",
      "Boutique en ligne, panier et créneaux",
      "Règlement au comptoir",
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
