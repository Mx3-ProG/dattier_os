import type { NavigationContribution } from "@/core/navigation/registry";

export const invoicesNavigation = {
  id: "invoices",
  name: "Factures fournisseurs",
  group: "PILOTAGE FINANCIER",
  icon: "FileText",
  permission: "finance",
  addon: "invoices",
} satisfies NavigationContribution;
