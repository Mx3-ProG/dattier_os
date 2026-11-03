import { rows, type DB } from "@/lib/database/db";

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
