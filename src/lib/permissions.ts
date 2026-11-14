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
export const permissions = [
  "security", "website", "catalog", "payments", "orders", "kitchen", "bar",
  "stock", "purchases", "finance", "team", "customers", "settings", "audit",
  "reservations", "floor", "payroll", "analytics",
] as const satisfies readonly Permission[];
/** Droits retirés par l’administrateur à un membre précis (table member_visibility). */
const restricted = Symbol.for("studio-os.denied-permissions");
type RestrictedRoles = Role[] & { [restricted]?: ReadonlySet<Permission> };
/**
 * Rattache aux rôles d’un membre les droits que l’administrateur lui a retirés.
 * Tous les contrôles serveur passent `user.roles ?? user.role` à `can` : la restriction
 * suit donc les rôles sans modifier chaque appel. Une restriction ne fait que retirer.
 */
export function restrictRoles(roles: readonly Role[], denied: readonly Permission[]): Role[] {
  const copy = [...roles] as RestrictedRoles;
  if (denied.length)
    Object.defineProperty(copy, restricted, { value: new Set(denied), enumerable: false });
  return copy;
}
export const deniedPermissions = (role: Role | readonly Role[]): Permission[] =>
  Array.isArray(role) ? [...((role as RestrictedRoles)[restricted] ?? [])] : [];
/** Droits accordés par les rôles, avant toute restriction individuelle. */
export const grantedPermissions = (role: Role | readonly Role[]): Permission[] =>
  permissions.filter((p) =>
    (Array.isArray(role) ? role : [role]).some((r) => grants[r as Role]?.includes(p)),
  );
export const can = (role: Role | readonly Role[], permission: Permission) =>
  !(Array.isArray(role) && (role as RestrictedRoles)[restricted]?.has(permission)) &&
  (Array.isArray(role) ? role : [role]).some((r) =>
    grants[r as Role]?.includes(permission),
  );
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
