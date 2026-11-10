import type { NavigationContribution } from "@/core/navigation/registry";
export const estimationNavigation = {
  id: "estimation",
  name: "Estimation",
  group: "PILOTAGE",
  icon: "Calculator",
  permission: "analytics",
  license: "estimation-studio",
} satisfies NavigationContribution;
