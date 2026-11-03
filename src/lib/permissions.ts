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
  | "security"
  | "website"
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
  | "reservations"
  | "floor";
const grants: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "security",
    "website",
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
    "floor",
  ],
  OWNER: [
    "security",
    "website",
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
    "floor",
  ],
  MANAGER: [
    "website",
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
    "floor",
  ],
  WAITER: ["orders", "payments", "reservations", "floor"],
  CHEF: ["kitchen", "stock", "orders"],
  BARTENDER: ["bar", "stock", "orders", "floor"],
  STOCK_MANAGER: ["stock", "purchases"],
  PURCHASING: ["purchases"],
  ACCOUNTANT: ["finance"],
};
export const can = (role: Role | readonly Role[], permission: Permission) =>
  (Array.isArray(role) ? role : [role]).some((r) =>
    grants[r as Role]?.includes(permission),
  );
export function requirePermission(
  role: Role | readonly Role[],
  permission: Permission,
) {
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
