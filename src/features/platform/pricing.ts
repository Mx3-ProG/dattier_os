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
export const monthlyPrice = (plan: Plan, seats: number) =>
  plan === 0 ? 0 : plan + additionalRestaurantPrice * (seats - 1);
