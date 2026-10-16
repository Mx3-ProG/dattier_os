export const roles = [
  "SUPER_ADMIN",
  "OWNER",
  "MANAGER",
  "WAITER",
  "CHEF",
  "BARTENDER",
  "STOCK_MANAGER",
  "PURCHASING",
  "ACCOUNTANT",
] as const;
export type Role = (typeof roles)[number];
export type Permission =
  | "catalog"
  | "payments"
  | "orders"
  | "kitchen"
  | "bar"
  | "stock"
  | "purchases"
  | "finance"
  | "team"
  | "customers"
  | "settings"
  | "audit"
  | "reservations";
const grants: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "catalog",
    "payments",
    "orders",
    "kitchen",
    "bar",
    "stock",
    "purchases",
    "finance",
    "team",
    "customers",
    "settings",
    "audit",
    "reservations",
  ],
  OWNER: [
    "catalog",
    "payments",
    "orders",
    "kitchen",
    "bar",
    "stock",
    "purchases",
    "finance",
    "team",
    "customers",
    "settings",
    "audit",
    "reservations",
  ],
  MANAGER: [
    "catalog",
    "payments",
    "orders",
    "kitchen",
    "bar",
    "stock",
    "purchases",
    "team",
    "customers",
    "audit",
    "reservations",
  ],
  WAITER: ["orders", "payments", "reservations"],
  CHEF: ["kitchen", "stock", "orders"],
  BARTENDER: ["bar", "stock", "orders"],
  STOCK_MANAGER: ["stock", "purchases"],
  PURCHASING: ["purchases"],
  ACCOUNTANT: ["finance"],
};
/** Un profil peut cumuler plusieurs rôles dans un établissement : ses permissions effectives en sont l’union. */
export type Subject = Role | { role: Role; roles?: readonly Role[] };
export const rolesOf = (s: Subject): readonly Role[] =>
  typeof s === "string" ? [s] : s.roles?.length ? s.roles : [s.role];
export const can = (s: Subject, permission: Permission) =>
  rolesOf(s).some((r) => grants[r]?.includes(permission) ?? false);
export const hasRole = (s: Subject, accepted: readonly Role[]) =>
  rolesOf(s).some((r) => accepted.includes(r));
export const permissionsOf = (s: Subject): Permission[] => [
  ...new Set(rolesOf(s).flatMap((r) => grants[r] ?? [])),
];
/** Ordre de préséance pour le rôle principal affiché : le plus large d’abord. */
export const primaryRole = (list: readonly Role[]): Role =>
  [...list].sort((a, b) => roles.indexOf(a) - roles.indexOf(b))[0];
export function requirePermission(s: Subject, permission: Permission) {
  if (!can(s, permission)) throw new Error("Accès refusé pour ce profil.");
}
export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  OWNER: "Propriétaire",
  MANAGER: "Manager",
  WAITER: "Salle",
  CHEF: "Cuisine",
  BARTENDER: "Bar",
  STOCK_MANAGER: "Stocks",
  PURCHASING: "Achats",
  ACCOUNTANT: "Comptabilité",
};
