import { restaurantPlan } from "@/features/platform/entitlements";
import { notFound } from "next/navigation";
import { NextRequest } from "next/server";
import { getDb, demoEnabled } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { website } from "@/features/cms/service";
import { seoFacts, platformUrl } from "@/features/seo/server";
import { siteUrls } from "@/features/seo/urls";
import { tenantRobots } from "@/features/seo/robots";
export const dynamic = "force-dynamic";
/** robots.txt of a restaurant domain (the proxy rewrites `/robots.txt` of a custom domain here). */
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
          if ((await restaurantPlan(tx, restaurant)) < 69) notFound();
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
  const body = tenantRobots({
    pathPrefix: "",
    sitemapUrl: urls.mirror ? null : `${urls.canonicalBase}/sitemap.xml`,
    blockAll: demoEnabled(),
    ai: config.seo.aiCrawlers,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
      Vary: "Host",
    },
  });
}
