import type { NavigationContribution } from "@/core/navigation/registry";

/** Navigation for existing operations still implemented in lib/actions and Management. */
export const stocksNavigation = {
  id: "stocks",
  name: "Stocks & inventaire",
  group: "GESTION",
  icon: "Package",
  permission: "stock",
} satisfies NavigationContribution;

export const recipesNavigation = {
  id: "recipes",
  name: "Recettes",
  group: "GESTION",
  icon: "BookOpen",
  permission: "stock",
} satisfies NavigationContribution;
