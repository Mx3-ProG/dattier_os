import { monthlyAddonIds } from "@/features/addons/catalog";
import type { DB } from "./types";

/** Appelée exclusivement pour la base PGlite de démonstration, jamais sur PostgreSQL. */
export async function grantDemoAddons(db: DB) {
  await db.query(`INSERT INTO addon_legacy_grants(restaurant_id,addon_id)
    SELECT r.id,a.id FROM restaurants r CROSS JOIN unnest($1::text[]) AS a(id)
    WHERE r.archived_at IS NULL
    ON CONFLICT DO NOTHING`, [[...monthlyAddonIds]]);
  await db.query(`INSERT INTO addon_licenses(restaurant_id,product_id,source)
    SELECT r.id,p.id,'demo' FROM restaurants r CROSS JOIN addon_products p
    WHERE r.archived_at IS NULL AND p.listed AND p.sellable AND p.price_cents>0
      AND p.pricing_mode IN ('one_time','subscription')
    ON CONFLICT DO NOTHING`);
}
