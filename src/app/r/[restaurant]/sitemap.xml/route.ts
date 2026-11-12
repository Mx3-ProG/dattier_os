import { restaurantPlan } from "@/features/platform/entitlements";
import { notFound } from "next/navigation";
import { NextRequest } from "next/server";
import { getDb, demoEnabled } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { website } from "@/features/cms/service";
import { seoFacts, platformUrl } from "@/features/seo/server";
import { siteUrls } from "@/features/seo/urls";
import { menu } from "@/application/snapshot";
import { productPath } from "@/domain/shared/product-pages";
import {
  indexablePages,
  renderSitemap,
  sitemapEntries,
  SITEMAP_MAX_URLS,
} from "@/features/seo/sitemap";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurant: string }> },
) {
  const { restaurant } = await params;
  const { config, facts, productIds } = await withDatabaseContext(
    { restaurantId: restaurant, public: true },
    () =>
      getDb().then((db) =>
        db.transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE atacuisine_app");
          if ((await restaurantPlan(tx, restaurant)) < 39) notFound();
          const config = await website(restaurant).getPublishedConfig(tx);
          const productIds =
            indexablePages(config).includes("carte") && !demoEnabled()
              ? (await menu(tx, restaurant))
                  .filter((item) => item.enabled)
                  .map((item) => item.id)
              : [];
          return {
            config,
            productIds,
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
  if (!demoEnabled() && !urls.mirror) {
    for (const id of productIds.slice(0, SITEMAP_MAX_URLS - entries.length)) {
      entries.push({ loc: urls.canonicalBase + productPath(id) });
    }
  }
  return new Response(renderSitemap(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
      Vary: "Host",
    },
  });
}
