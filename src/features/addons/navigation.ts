import type { NavigationContribution } from "@/core/navigation/registry";

export const addonsNavigation = {
  id: "addons",
  name: "Add-ons",
  group: "CONFIGURATION",
  icon: "Package",
  permission: "settings",
} satisfies NavigationContribution;
