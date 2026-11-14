import { workspaceNavigation } from "@/features/navigation/catalog";
import { grantedPermissions, type Role } from "@/lib/permissions";

const catalog = workspaceNavigation.list();

/** Entrées du poste de travail que les rôles d’un membre lui donnent (sans tenir compte des modules installés). */
export function entriesForRoles(roles: readonly Role[]) {
  const granted = new Set(grantedPermissions(roles));
  return catalog
    .filter((entry) => !entry.permission || granted.has(entry.permission))
    .map(({ id, name, group, permission }) => ({ id, name, group, permission }));
}

export const navigationGroups = [
  "PILOTAGE",
  "OPÉRATIONS",
  "GESTION",
  "ÉQUIPE",
  "PILOTAGE FINANCIER",
  "RELATION CLIENT",
  "CONFIGURATION",
] as const;

/** Propriétaire et super administrateur voient toujours tout : aucune restriction individuelle. */
export const unrestricted = (roles: readonly Role[]) =>
  roles.includes("OWNER") || roles.includes("SUPER_ADMIN");
