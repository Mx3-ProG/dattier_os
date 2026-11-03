import { NextRequest } from "next/server";
import { getDb, demoEnabled } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { website } from "@/features/cms/service";
import { seoFacts, platformUrl } from "@/features/seo/server";
import { siteUrls } from "@/features/seo/urls";
import { renderSitemap, sitemapEntries } from "@/features/seo/sitemap";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurant: string }> },
) {
  const { restaurant } = await params;
  const { config, facts } = await withDatabaseContext(
    { restaurantId: restaurant, public: true },
    () =>
      getDb().then((db) =>
        db.transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE dattier_app");
          return {
            config: await website(restaurant).getPublishedConfig(tx),
            facts: await seoFacts(tx, restaurant),
          };
        }),
      ),
  );
  const urls = siteUrls({
    restaurant,
    platformUrl: platformUrl(req.nextUrl.origin),
    primaryHost: facts.primaryHost,
    requestHost: req.headers.get("host") || req.nextUrl.host,
    demo: demoEnabled(),
  });
  // A sitemap only lists URLs of its own host: the platform mirror of a site
  // that has its own domain publishes nothing.
  const entries =
    demoEnabled() || urls.mirror
      ? []
      : sitemapEntries({
          config,
          canonicalBase: urls.canonicalBase,
          publishedAt: facts.publishedAt,
        });
  return new Response(renderSitemap(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
      Vary: "Host",
    },
  });
}
