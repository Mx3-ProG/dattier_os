import type { NavigationContribution } from "@/core/navigation/registry";

export const financeNavigation = {
  id: "finance",
  name: "Finances & rapports",
  group: "PILOTAGE FINANCIER",
  icon: "Wallet",
  permission: "finance",
  commercialCapability: "finance",
} satisfies NavigationContribution;

export const accountingNavigation = {
  id: "accounting",
  name: "Opérations à vérifier",
  group: "PILOTAGE FINANCIER",
  icon: "ClipboardCheck",
  permission: "finance",
  commercialCapability: "finance",
} satisfies NavigationContribution;

export const expensesNavigation = {
  id: "expenses",
  name: "Dépenses",
  group: "PILOTAGE FINANCIER",
  icon: "Receipt",
  permission: "finance",
  commercialCapability: "finance",
} satisfies NavigationContribution;
