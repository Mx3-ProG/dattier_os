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
  | "floor"
  | "payroll"
  | "analytics";
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
    "payroll",
    "analytics",
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
    "payroll",
    "analytics",
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
    "analytics",
  ],
  WAITER: ["orders", "payments", "reservations", "floor"],
  CHEF: ["kitchen", "stock", "orders"],
  BARTENDER: ["bar", "stock", "orders", "floor"],
  STOCK_MANAGER: ["stock", "purchases"],
  PURCHASING: ["purchases"],
  ACCOUNTANT: ["finance", "payroll"],
};
export const can = (role: Role | readonly Role[], permission: Permission) =>
  (Array.isArray(role) ? role : [role]).some((r) =>
    grants[r as Role]?.includes(permission),
  );
/** Vrai si l’un des rôles du profil dans l’établissement fait partie de `accepted`. */
export const hasRole = (
  role: Role | readonly Role[],
  accepted: readonly Role[],
) => (Array.isArray(role) ? role : [role]).some((r) => accepted.includes(r));
/** Permissions effectives d’un profil : l’union de celles de ses rôles dans l’établissement. */
export const permissionsOf = (role: Role | readonly Role[]): Permission[] => [
  ...new Set(
    (Array.isArray(role) ? role : [role]).flatMap(
      (r) => grants[r as Role] ?? [],
    ),
  ),
];
export function requirePermission(
  role: Role | readonly Role[],
  permission: Permission,
) {
  if (!can(role, permission)) throw new Error("Accès refusé pour ce profil.");
}
/** Postes qu’un administrateur peut attribuer en ajoutant directement une personne. */
export const teamRoles = [
  "MANAGER",
  "WAITER",
  "CHEF",
  "BARTENDER",
  "STOCK_MANAGER",
  "PURCHASING",
  "ACCOUNTANT",
] as const satisfies readonly Role[];
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
