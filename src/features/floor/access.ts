import { compareArrangement } from "./capabilities";
import { rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { can, requirePermission, type Role } from "@/lib/permissions";
import { moduleEnabled, requireModule } from "@/features/modules/access";

/** Rôles qui gardent toujours le droit d’aménager : il ne leur est pas retirable. */
const alwaysArrange: Role[] = ["SUPER_ADMIN", "OWNER"];

/**
 * Droit de modifier le plan de salle (zones, ajout, déplacement, rotation, archivage).
 * Le propriétaire l’accorde ou le retire membre par membre (table floor_layout_access) ;
 * sans décision explicite, un rôle qui a l’accès « floor » (manager, salle, bar) l’a.
 */
export async function canArrange(db: DB, r: string, user: Actor) {
  if (!(await moduleEnabled(db, r, "floor"))) return false;
  const roles = user.roles ?? [user.role];
  const observe = (legacy: boolean, override: boolean | null) => {
    if (process.env.STUDIO_OS_ENTITLEMENTS_SHADOW === "true") {
      const result = compareArrangement(roles, override, legacy);
      if (!result.matches)
        console.warn("[studio-os] floor.arrange permission mismatch", {
          reason: result.reason,
        });
    }
    return legacy;
  };
  if (roles.some((x) => alwaysArrange.includes(x))) return observe(true, null);
  if (!can(roles, "floor")) return observe(false, null);
  const [row] = await rows<{ allowed: boolean }>(
    db,
    "SELECT allowed FROM floor_layout_access WHERE restaurant_id=$1 AND profile_id=$2",
    [r, user.id],
  );
  return observe(row?.allowed ?? true, row?.allowed ?? null);
}

export async function requireArrange(db: DB, r: string, user: Actor) {
  await requireModule(db, r, "floor");
  requirePermission(user.roles ?? user.role, "floor");
  if (!(await canArrange(db, r, user)))
    throw new Error(
      "Le propriétaire ne vous a pas donné le droit de modifier le plan de salle.",
    );
}
