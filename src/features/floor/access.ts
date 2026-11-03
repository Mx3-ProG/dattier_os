import { rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { can, requirePermission, type Role } from "@/lib/permissions";

/** Rôles qui gardent toujours le droit d’aménager : il ne leur est pas retirable. */
const alwaysArrange: Role[] = ["SUPER_ADMIN", "OWNER"];

/**
 * Droit de modifier le plan de salle (zones, ajout, déplacement, rotation, archivage).
 * Le propriétaire l’accorde ou le retire membre par membre (table floor_layout_access) ;
 * sans décision explicite, un rôle qui a l’accès « floor » (manager, salle, bar) l’a.
 */
export async function canArrange(db: DB, r: string, user: Actor) {
  const roles = user.roles ?? [user.role];
  if (roles.some((x) => alwaysArrange.includes(x))) return true;
  if (!can(roles, "floor")) return false;
  const [row] = await rows<{ allowed: boolean }>(
    db,
    "SELECT allowed FROM floor_layout_access WHERE restaurant_id=$1 AND profile_id=$2",
    [r, user.id],
  );
  return row?.allowed ?? true;
}

export async function requireArrange(db: DB, r: string, user: Actor) {
  requirePermission(user.roles ?? user.role, "floor");
  if (!(await canArrange(db, r, user)))
    throw new Error(
      "Le propriétaire ne vous a pas donné le droit de modifier le plan de salle.",
    );
}
