import type { NavigationContribution } from "@/core/navigation/registry";

export const payoutsNavigation = {
  id: "payouts",
  name: "Mes versements",
  group: "PILOTAGE FINANCIER",
  icon: "Banknote",
  permission: "finance",
  commercialCapability: "finance",
} satisfies NavigationContribution;
