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
export const additionalRestaurantPrice = 39;
/** Paying referrals needed for the base subscription to be offered. */
export const referralGoal = 5;
/** Monthly price; with enough paying referrals the base plan is offered, extra establishments stay billed. */
export const monthlyPrice = (plan: Plan, seats: number, payingReferrals = 0) =>
  plan === 0
    ? 0
    : (payingReferrals >= referralGoal ? 0 : plan) +
      additionalRestaurantPrice * (seats - 1);

/** Cookie set by /parrainage/{code}, read when the referred customer onboards. */
export const referralCookie = "atacuisine_parrain";
