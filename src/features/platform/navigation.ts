import type { NavigationContribution } from "@/core/navigation/registry";

export const settingsNavigation = {
  id: "settings",
  name: "Établissements",
  group: "CONFIGURATION",
  icon: "Settings",
  permission: "settings",
} satisfies NavigationContribution;
