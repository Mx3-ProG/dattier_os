import { z } from "zod";
import { workspaceNavigation } from "@/features/navigation/catalog";
import { grantedPermissions, type Permission, type Role } from "@/lib/permissions";
import { one, rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { log } from "@/features/orders/service";
import { staffSchemaReady } from "./pins";
import { entriesForRoles, unrestricted } from "./entries";

/**
 * Ce que chaque membre voit dans le poste de travail, décidé par l’administrateur.
 * Les entrées de menu masquées sont une préférence d’affichage ; quand toutes les
 * entrées d’un même droit sont masquées, le droit est aussi retiré côté serveur.
 */
const catalog = workspaceNavigation.list();
export { entriesForRoles };

/** Droits à retirer : ceux dont chaque entrée de menu est masquée pour ce membre. */
export function deniedFor(roles: readonly Role[], hidden: readonly string[]): Permission[] {
  const masked = new Set(hidden);
  return grantedPermissions(roles).filter((permission) => {
    const entries = catalog.filter((entry) => entry.permission === permission);
    return entries.length > 0 && entries.every((entry) => masked.has(entry.id));
  });
}

export { memberDenied } from "./restrictions";

export async function memberHidden(db: DB, r: string, profile: string): Promise<string[]> {
  if (!(await staffSchemaReady(db))) return [];
  const found = await rows<{ hidden: string[] }>(
    db,
    "SELECT hidden FROM member_visibility WHERE restaurant_id=$1 AND profile_id=$2",
    [r, profile],
  );
  return found[0]?.hidden ?? [];
}

export const visibilitySchema = z.object({
  action: z.literal("visibility"),
  profile: z.string().min(1).max(100),
  hidden: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).max(100),
});

export async function saveVisibility(
  db: DB,
  r: string,
  admin: Actor,
  a: z.infer<typeof visibilitySchema>,
) {
  if (!(await staffSchemaReady(db)))
    throw new Error("Réglage indisponible : mise à jour de la base en attente.");
  const memberRoles = (
    await rows<{ role: Role }>(
      db,
      "SELECT role FROM memberships WHERE restaurant_id=$1 AND profile_id=$2",
      [r, a.profile],
    )
  ).map((m) => m.role);
  if (!memberRoles.length) throw new Error("Ce membre ne fait pas partie de l’établissement.");
  if (unrestricted(memberRoles))
    throw new Error("Un propriétaire voit toujours l’ensemble de l’établissement.");
  const allowed = new Set(entriesForRoles(memberRoles).map((entry) => entry.id));
  const hidden = [...new Set(a.hidden)].filter((id) => allowed.has(id)).sort();
  const denied = deniedFor(memberRoles, hidden);
  await db.query(
    `INSERT INTO member_visibility(restaurant_id,profile_id,hidden,denied,updated_by) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(restaurant_id,profile_id) DO UPDATE SET hidden=EXCLUDED.hidden,denied=EXCLUDED.denied,updated_by=EXCLUDED.updated_by,updated_at=now()`,
    [r, a.profile, hidden, denied, admin.id],
  );
  await log(db, r, admin.id, "Visibilité d’un membre modifiée", a.profile);
  return { hidden, denied };
}

/** Réglages de tous les membres, pour l’écran d’administration de l’équipe. */
export async function teamVisibility(db: DB, r: string) {
  if (!(await staffSchemaReady(db))) return { ready: false, rows: [], pins: [], pinRequired: false };
  const { pin_required } = await one<{ pin_required: boolean }>(
    db,
    "SELECT staff_pin_required AS pin_required FROM restaurants WHERE id=$1",
    [r],
  );
  return {
    ready: true,
    pinRequired: pin_required,
    rows: await rows<{ profile_id: string; hidden: string[] }>(
      db,
      "SELECT profile_id,hidden FROM member_visibility WHERE restaurant_id=$1",
      [r],
    ),
    pins: await rows<{ profile_id: string; set_at: string; locked: boolean; failed_attempts: number }>(
      db,
      "SELECT profile_id,set_at,coalesce(locked_until>now(),false) AS locked,failed_attempts FROM staff_pins WHERE restaurant_id=$1",
      [r],
    ),
  };
}
