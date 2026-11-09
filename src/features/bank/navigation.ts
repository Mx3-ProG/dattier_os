import type { NavigationContribution } from "@/core/navigation/registry";

export const bankNavigation = {
  id: "bank",
  name: "Banque",
  group: "PILOTAGE FINANCIER",
  icon: "Landmark",
  permission: "finance",
  commercialCapability: "finance",
} satisfies NavigationContribution;
