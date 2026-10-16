import type { Permission } from "@/lib/permissions";
/**
 * Rubriques de l’activité, alignées sur les modules de l’espace de travail.
 * Chaque événement et chaque notification appartient à une rubrique ; la
 * rubrique fixe la visibilité par défaut (au moins une des permissions) et le
 * module ouvert au clic (`fallback` si le profil n’a pas accès au module).
 * Importable côté client.
 */
export type Category = {
  id: string;
  label: string;
  group: string;
  permissions: Permission[] | null;
  fallback?: string;
};
export const categories = [
  {
    id: "kitchen",
    label: "Cuisine",
    group: "Service",
    permissions: ["kitchen", "orders"],
    fallback: "orders",
  },
  {
    id: "bar",
    label: "Bar",
    group: "Service",
    permissions: ["bar", "orders"],
    fallback: "orders",
  },
  {
    id: "orders",
    label: "Commandes & encaissements",
    group: "Service",
    permissions: ["orders", "payments"],
  },
  {
    id: "dining",
    label: "Plan de salle",
    group: "Service",
    permissions: ["orders", "reservations"],
  },
  {
    id: "reservations",
    label: "Réservations",
    group: "Service",
    permissions: ["reservations"],
  },
  {
    id: "stocks",
    label: "Stocks & inventaire",
    group: "Gestion",
    permissions: ["stock", "purchases"],
    fallback: "deliveries",
  },
  {
    id: "recipes",
    label: "Recettes",
    group: "Gestion",
    permissions: ["stock", "catalog"],
    fallback: "menu",
  },
  {
    id: "suppliers",
    label: "Fournisseurs",
    group: "Gestion",
    permissions: ["purchases"],
  },
  {
    id: "deliveries",
    label: "Livraisons",
    group: "Gestion",
    permissions: ["purchases", "stock"],
    fallback: "stocks",
  },
  {
    id: "team",
    label: "Équipe & planning",
    group: "Équipe",
    permissions: ["team"],
    fallback: "attendance",
  },
  {
    id: "attendance",
    label: "Présences",
    group: "Équipe",
    permissions: ["team"],
  },
  {
    id: "finance",
    label: "Finances & rapports",
    group: "Finances",
    permissions: ["finance"],
  },
  {
    id: "expenses",
    label: "Dépenses",
    group: "Finances",
    permissions: ["finance"],
  },
  {
    id: "customers",
    label: "Clients & fidélité",
    group: "Relation client",
    permissions: ["customers"],
  },
  {
    id: "menu",
    label: "La carte",
    group: "Configuration",
    permissions: ["catalog"],
  },
  {
    id: "settings",
    label: "Établissement",
    group: "Configuration",
    permissions: ["settings"],
  },
  {
    id: "general",
    label: "Général",
    group: "Général",
    permissions: null,
  },
] as const satisfies readonly Category[];
export type CategoryId = (typeof categories)[number]["id"];
const byId = new Map<string, Category>(categories.map((c) => [c.id, c]));
export const category = (id: string | null | undefined): Category =>
  byId.get(id ?? "") ?? byId.get("general")!;
/** Module à ouvrir pour une rubrique, ou `null` si le profil n’a accès à aucun. */
export function targetModule(id: string | null, allowed: readonly string[]) {
  const c = category(id);
  if (allowed.includes(c.id)) return c.id;
  if (c.fallback && allowed.includes(c.fallback)) return c.fallback;
  return null;
}
/** Durée pendant laquelle une notification reste dans le centre ; au-delà, elle n’est plus que dans l’historique. */
export const notificationRetentionDays = 7;
