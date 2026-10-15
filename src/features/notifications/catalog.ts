import type { Permission } from "@/lib/permissions";
/**
 * Catalogue des notifications : qui peut les voir (au moins une des
 * permissions, `null` = tout l’établissement), priorité par défaut et module
 * de l’espace de travail ouvert au clic. Importable côté client (aucune
 * dépendance serveur) pour l’écran de préférences.
 */
export type Priority = "low" | "normal" | "high" | "critical";
export type NotificationKind = {
  label: string;
  group: "Cuisine & salle" | "Stocks" | "Finances" | "Équipe" | "Général";
  permissions: Permission[] | null;
  priority: Priority;
  module: string | null;
};
export const notificationCatalog = {
  "system.info": {
    label: "Informations générales",
    group: "Général",
    permissions: null,
    priority: "normal",
    module: null,
  },
  "order.created": {
    label: "Nouvelle commande",
    group: "Cuisine & salle",
    permissions: ["orders", "kitchen", "bar"],
    priority: "normal",
    module: "orders",
  },
  "order.pending": {
    label: "Demande de commande à confirmer",
    group: "Cuisine & salle",
    permissions: ["orders"],
    priority: "high",
    module: "orders",
  },
  "order.ready": {
    label: "Préparation prête à servir",
    group: "Cuisine & salle",
    permissions: ["orders"],
    priority: "high",
    module: "orders",
  },
  "order.late": {
    label: "Commande en retard",
    group: "Cuisine & salle",
    permissions: ["orders", "kitchen", "bar"],
    priority: "high",
    module: "orders",
  },
  "menu.unavailable": {
    label: "Produit indisponible (stock insuffisant)",
    group: "Cuisine & salle",
    permissions: ["orders", "kitchen", "bar", "catalog"],
    priority: "high",
    module: "menu",
  },
  "reservation.requested": {
    label: "Demande de réservation",
    group: "Cuisine & salle",
    permissions: ["reservations"],
    priority: "normal",
    module: "reservations",
  },
  "stock.low": {
    label: "Stock faible",
    group: "Stocks",
    permissions: ["stock", "purchases"],
    priority: "high",
    module: "stocks",
  },
  "stock.out": {
    label: "Rupture de stock",
    group: "Stocks",
    permissions: ["stock", "purchases"],
    priority: "critical",
    module: "stocks",
  },
  "stock.expiring": {
    label: "Lot proche de sa date limite",
    group: "Stocks",
    permissions: ["stock"],
    priority: "normal",
    module: "stocks",
  },
  "stock.inventory_gap": {
    label: "Écart d’inventaire",
    group: "Stocks",
    permissions: ["stock"],
    priority: "normal",
    module: "stocks",
  },
  "purchase.received": {
    label: "Livraison réceptionnée",
    group: "Stocks",
    permissions: ["stock", "purchases"],
    priority: "normal",
    module: "deliveries",
  },
  "finance.unusual_expense": {
    label: "Dépense inhabituelle",
    group: "Finances",
    permissions: ["finance"],
    priority: "high",
    module: "expenses",
  },
  "team.shift": {
    label: "Modification de votre planning",
    group: "Équipe",
    permissions: null,
    priority: "normal",
    module: "attendance",
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
