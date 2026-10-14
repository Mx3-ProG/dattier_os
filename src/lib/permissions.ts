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
export const can = (role: Role, permission: Permission) =>
  grants[role]?.includes(permission) ?? false;
export function requirePermission(role: Role, permission: Permission) {
  if (!can(role, permission)) throw new Error("Accès refusé pour ce profil.");
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
