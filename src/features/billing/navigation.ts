import type { NavigationContribution } from "@/core/navigation/registry";

export const billingNavigation = {
  id: "billing",
  name: "Factures clients",
  group: "PILOTAGE FINANCIER",
  icon: "FileSignature",
  permission: "finance",
  addon: "client-invoices",
} satisfies NavigationContribution;
