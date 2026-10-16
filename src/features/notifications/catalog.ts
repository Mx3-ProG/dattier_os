import type { Permission } from "@/lib/permissions";
import type { CategoryId } from "@/features/events/categories";
/**
 * Catalogue des notifications : priorité par défaut et rubriques où elles
 * apparaissent. La visibilité est celle de la rubrique de l’événement
 * (voir `events/categories.ts`), sauf `permissions` explicites ou
 * destinataire nominatif. Importable côté client (écran de préférences).
 */
export type Priority = "low" | "normal" | "high" | "critical";
export type NotificationKind = {
  label: string;
  group: "Cuisine & salle" | "Stocks" | "Finances" | "Équipe" | "Général";
  /** Remplace la visibilité de la rubrique (au moins une des permissions). */
  permissions?: Permission[];
  priority: Priority;
  categories: CategoryId[];
};
export const notificationCatalog = {
  "system.info": {
    label: "Informations générales",
    group: "Général",
    priority: "normal",
    categories: ["general"],
  },
  "order.created": {
    label: "Nouvelle commande",
    group: "Cuisine & salle",
    priority: "normal",
    categories: ["kitchen", "bar"],
  },
  "order.pending": {
    label: "Demande de commande à confirmer",
    group: "Cuisine & salle",
    priority: "high",
    categories: ["orders"],
  },
  "order.ready": {
    label: "Préparation prête à servir",
    group: "Cuisine & salle",
    priority: "high",
    categories: ["kitchen", "bar"],
  },
  "order.late": {
    label: "Commande en retard",
    group: "Cuisine & salle",
    priority: "high",
    categories: ["kitchen", "bar"],
  },
  "menu.unavailable": {
    label: "Produit indisponible (stock insuffisant)",
    group: "Cuisine & salle",
    permissions: ["orders", "kitchen", "bar", "catalog"],
    priority: "high",
    categories: ["menu"],
  },
  "reservation.requested": {
    label: "Demande de réservation",
    group: "Cuisine & salle",
    priority: "normal",
    categories: ["reservations"],
  },
  "stock.low": {
    label: "Stock faible",
    group: "Stocks",
    priority: "high",
    categories: ["stocks"],
  },
  "stock.out": {
    label: "Rupture de stock",
    group: "Stocks",
    priority: "critical",
    categories: ["stocks"],
  },
  "stock.expiring": {
    label: "Lot proche de sa date limite",
    group: "Stocks",
    priority: "normal",
    categories: ["stocks"],
  },
  "stock.inventory_gap": {
    label: "Écart d’inventaire",
    group: "Stocks",
    priority: "normal",
    categories: ["stocks"],
  },
  "purchase.received": {
    label: "Livraison réceptionnée",
    group: "Stocks",
    priority: "normal",
    categories: ["deliveries"],
  },
  "finance.unusual_expense": {
    label: "Dépense inhabituelle",
    group: "Finances",
    priority: "high",
    categories: ["expenses"],
  },
  "team.shift": {
    label: "Modification de votre planning",
    group: "Équipe",
    priority: "normal",
    categories: ["team"],
  },
} satisfies Record<string, NotificationKind>;
export type NotificationType = keyof typeof notificationCatalog;
export const notificationTypes = Object.keys(
  notificationCatalog,
) as NotificationType[];
export const isNotificationType = (t: string): t is NotificationType =>
  t in notificationCatalog;
/** Seuils des alertes calculées périodiquement. */
export const alertSettings = { lateMinutes: 20, expiryDays: 2 };
