import type { NavigationContribution } from "@/core/navigation/registry";

export const menuNavigation = {
  id: "menu",
  name: "La carte",
  group: "CONFIGURATION",
  icon: "BookOpen",
  permission: "catalog",
} satisfies NavigationContribution;
