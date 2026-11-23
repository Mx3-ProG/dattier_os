import type { NavigationContribution } from "@/core/navigation/registry";

export const settingsNavigation = {
  id: "settings",
  name: "Établissements",
  group: "CONFIGURATION",
  icon: "Settings",
  permission: "settings",
} satisfies NavigationContribution;

export const dashboardNavigation = {
  id: "dashboard",
  name: "Modifier mon tableau de bord",
  group: "CONFIGURATION",
  icon: "LayoutDashboard",
  permission: "settings",
} satisfies NavigationContribution;
