import type { NavigationContribution } from "@/core/navigation/registry";
import { tradeNavigationLicense } from "./definitions";

/** Une seule entrée pour tous les outils métier installés ; chaque outil vérifie ses droits. */
export const tradeNavigation = {
  id: "trade-tools",
  name: "Outils métier",
  group: "GESTION",
  icon: "ClipboardCheck",
  permission: null,
  license: tradeNavigationLicense,
} satisfies NavigationContribution;
