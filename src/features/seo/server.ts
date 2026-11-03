import { cache } from "react";
import { getDb, rows, type DB } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { DEFAULT_LOCALE, safeLanguage } from "./locale";

/** Published language of a site, for <html lang>. Falls back to French on any error. */
export const siteLanguage = cache(async (restaurant: string) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(restaurant)) return DEFAULT_LOCALE.language;
  try {
    return await withDatabaseContext(
      { restaurantId: restaurant, public: true },
      async () =>
        (await getDb()).transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE dattier_app");
          const [row] = await rows<{ lang: string | null }>(
            tx,
            "SELECT v.config #>> '{seo,locale,language}' AS lang FROM cms_versions v JOIN restaurant_cms c ON c.published_version_id=v.id WHERE c.restaurant_id=$1 AND v.restaurant_id=$1",
            [restaurant],
          );
          return safeLanguage(row?.lang);
        }),
    );
  } catch {
    return DEFAULT_LOCALE.language;
  }
});

/** Tenant facts needed for canonical URLs and sitemaps. Runs inside the tenant's public DB context. */
export async function seoFacts(db: DB, restaurant: string) {
  const [domain] = await rows<{ host: string | null }>(
    db,
    "SELECT app.primary_domain($1) AS host",
    [restaurant],
  );
  const [published] = await rows<{ published_at: string }>(
    db,
    "SELECT v.published_at FROM cms_versions v JOIN restaurant_cms c ON c.published_version_id=v.id WHERE c.restaurant_id=$1 AND v.restaurant_id=$1",
    [restaurant],
  );
  return {
    primaryHost: domain?.host ?? null,
    publishedAt: published ? String(published.published_at) : null,
  };
}

/** Platform origin used to build absolute URLs. */
export function platformUrl(fallback = "http://127.0.0.1:3000") {
  return process.env.APP_URL || fallback;
}

/** Restaurant sites indexed under the platform host (no domain of their own). */
export async function platformSites(db: DB) {
  return rows<{ restaurant_id: string; published_at: string }>(
    db,
    "SELECT restaurant_id,published_at FROM app.platform_sites()",
  );
}
