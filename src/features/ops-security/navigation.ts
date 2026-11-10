import type { NavigationContribution } from "@/core/navigation/registry";

export const activityNavigation = {
  id: "activity",
  name: "Activité",
  group: "PILOTAGE",
  icon: "Activity",
  permission: "audit",
} satisfies NavigationContribution;

export const securityNavigation = {
  id: "security",
  name: "Sécurité opérationnelle",
  group: "CONFIGURATION",
  icon: "ShieldCheck",
  permission: "security",
} satisfies NavigationContribution;
