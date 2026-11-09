import type { NavigationContribution } from "@/core/navigation/registry";

export const floorNavigation = {
  id: "dining",
  name: "Plan de salle",
  group: "OPÉRATIONS",
  icon: "UtensilsCrossed",
  permission: "orders",
} satisfies NavigationContribution;
