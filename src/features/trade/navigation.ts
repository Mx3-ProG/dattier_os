import type { NavigationContribution, NavigationIcon } from "@/core/navigation/registry";
import { tradeTools, type TradeToolId } from "./definitions";

/** Entrée du poste de travail d'un outil métier : `tool-<id>`. */
export const toolNavigationId = (tool: string) => `tool-${tool}`;
export const toolFromNavigation = (navigationId: string) =>
  navigationId.startsWith("tool-") ? navigationId.slice("tool-".length) : null;

const icons: Partial<Record<TradeToolId, NavigationIcon>> = {
  "kitchen-display": "ChefHat",
  "recipe-cost": "Calculator",
  "menu-allergens": "ShieldCheck",
  "service-pacing": "Clock",
  "waste-tracker": "Package",
  "site-planning": "CalendarDays",
  "site-report": "ClipboardCheck",
  "quote-builder": "FileSignature",
  "equipment-log": "Truck",
  "appointment-booking": "CalendarDays",
  "chair-occupancy": "Activity",
  "client-style": "Users",
  "salon-stock": "Package",
  "product-variants": "Package",
  "abandoned-cart": "Receipt",
  "shipping-rules": "Truck",
  "product-bundles": "Package",
  "customer-segments": "Users",
  "loyalty-campaigns": "Heart",
  "conversion-insights": "Activity",
};

/**
 * Une entrée OPÉRATIONS par outil métier. Elle n'apparaît que si l'outil est
 * installé (licence) et permis au profil ; le serveur revérifie chaque accès.
 */
export const tradeToolNavigation = tradeTools.map(
  (tool) =>
    ({
      id: toolNavigationId(tool.id),
      name: tool.name,
      group: "OPÉRATIONS",
      icon: icons[tool.id as TradeToolId] ?? "ClipboardCheck",
      permission: tool.permission,
      license: tool.id,
    }) satisfies NavigationContribution,
);
