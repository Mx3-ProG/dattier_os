import type { NavigationContribution } from "@/core/navigation/registry";

export const customersNavigation = {
  id: "customers",
  name: "Clients & fidélité",
  group: "RELATION CLIENT",
  icon: "Heart",
  permission: "customers",
  addon: "loyalty",
} satisfies NavigationContribution;
