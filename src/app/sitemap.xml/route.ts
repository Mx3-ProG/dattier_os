import { getDb, demoEnabled } from "@/lib/database/db";
import { platformSites } from "@/features/seo/server";
import { renderSitemapIndex } from "@/features/seo/sitemap";
export const dynamic = "force-dynamic";
/**
 * Platform host only (a restaurant domain's /sitemap.xml is rewritten to its own).
 * Index of the platform pages and of restaurant sites published under /r/{id}.
 */
export async function GET() {
  const app = process.env.APP_URL;
  let entries: { loc: string; lastmod?: string }[] = [];
  if (!demoEnabled() && app) {
    const sites = await getDb()
      .then((db) =>
        db.transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE dattier_app");
          return platformSites(tx);
        }),
      )
      .catch(() => []);
    entries = [
      { loc: new URL("/sitemap-platform.xml", app).href },
      ...sites.map((s) => ({
        loc: new URL(`/r/${encodeURIComponent(s.restaurant_id)}/sitemap.xml`, app).href,
        lastmod: new Date(s.published_at).toISOString(),
      })),
    ];
  }
  return new Response(renderSitemapIndex(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
