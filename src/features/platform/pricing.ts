import { referralPricing } from "./referrals";
export const plans = [
  {
    price: 39,
    title: "Exploitation",
    description:
      "Salle, réservations, commandes, carte, stocks, achats et équipe.",
  },
  {
    price: 69,
    title: "Site et fidélité",
    description:
      "En plus, site personnalisable, domaines, référencement, fidélité, finances et rapports.",
  },
  {
    price: 99,
    title: "Boutique en ligne",
    description:
      "En plus, boutique, panier, créneaux et commandes avec règlement au comptoir.",
  },
] as const;

export type Plan = 0 | (typeof plans)[number]["price"];
export { additionalRestaurantPrice } from "./referrals";
/** Monthly price billed, after the referral tiers and offered establishments. */
export const monthlyPrice = (plan: Plan, seats: number, payingReferrals = 0) =>
  referralPricing(plan, seats, payingReferrals).total;

/** Cookie set by /parrainage/{code}, read when the referred customer onboards. */
export const referralCookie = "atacuisine_parrain";
