import type { Permission } from "@/lib/permissions";
import { rows, type DB } from "@/lib/database/db";
import { staffSchemaReady } from "./pins";

/**
 * Droits retirés par l’administrateur à un membre (calculés à l’enregistrement, cf. visibility.ts).
 * Module léger : importé par `scope()`, il ne doit pas tirer la navigation ni les services.
 */
export async function memberDenied(db: DB, r: string, profile: string): Promise<Permission[]> {
  if (!(await staffSchemaReady(db))) return [];
  const found = await rows<{ denied: Permission[] }>(
    db,
    "SELECT denied FROM member_visibility WHERE restaurant_id=$1 AND profile_id=$2",
    [r, profile],
  );
  return found[0]?.denied ?? [];
}
