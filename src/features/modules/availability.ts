import type { DB } from "@/infrastructure/database/types";
import type { BusinessId } from "@/core/tenant/business";
import { isModuleId, moduleIds, type ModuleId } from "@/core/modules/manifest";

/**
 * Décision commerciale unique par module (`app.module_available`, migration 090).
 * Lot P1-a1 : lecture seule, aucun écran ni service ne s'en sert encore pour décider.
 * Les permissions de rôle restent vérifiées à part (`can`, services).
 */
export async function moduleAvailable(db: DB, business: BusinessId, module: ModuleId) {
  if (!isModuleId(module)) return false;
  const { rows } = await db.query<{ available: boolean | null }>(
    "SELECT app.module_available($1::text,$2::text) AS available",
    [business, module],
  );
  // NULL (module inconnu de la base) se lit comme indisponible.
  return rows[0]?.available === true;
}

/** Modules disponibles pour un commerce, dans l'ordre du manifeste. Une seule requête. */
export async function availableModules(db: DB, business: BusinessId): Promise<ModuleId[]> {
  const { rows } = await db.query<{ module: string }>(
    "SELECT m AS module FROM unnest($2::text[]) WITH ORDINALITY AS t(m,n) WHERE app.module_available($1::text,m) IS TRUE ORDER BY n",
    [business, [...moduleIds]],
  );
  return rows.map((row) => row.module).filter(isModuleId);
}
