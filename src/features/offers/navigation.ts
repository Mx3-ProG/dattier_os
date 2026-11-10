import type { NavigationContribution } from "@/core/navigation/registry";

/** Prestations vendues par le commerce : durée, prix, disponibilités, affichage sur le site. */
export const servicesNavigation = {
  id: "services",
  name: "Services",
  group: "GESTION",
  icon: "CalendarDays",
  permission: "catalog",
} satisfies NavigationContribution;

/** Produits vendus par le commerce : photos, description, prix, livraison, stock facultatif. */
export const productsNavigation = {
  id: "products",
  name: "Produits",
  group: "GESTION",
  icon: "Package",
  permission: "catalog",
} satisfies NavigationContribution;
