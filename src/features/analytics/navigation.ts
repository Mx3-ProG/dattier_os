import type { NavigationContribution } from "@/core/navigation/registry";
import { earthTrackerProduct } from "./modules";

export const analyticsNavigation = {
  id: "audience",
  name: "Statistiques du site",
  group: "PILOTAGE",
  icon: "Earth",
  permission: "analytics",
  license: earthTrackerProduct,
} satisfies NavigationContribution;
