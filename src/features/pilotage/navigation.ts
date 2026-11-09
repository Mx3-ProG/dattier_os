import type { NavigationContribution } from "@/core/navigation/registry";

export const overviewNavigation = {
  id: "overview",
  name: "Vue d’ensemble",
  group: "PILOTAGE",
  icon: "LayoutDashboard",
  permission: "finance",
  commercialCapability: "finance",
} satisfies NavigationContribution;
