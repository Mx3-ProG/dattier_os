import { restaurantPlan } from "@/features/platform/entitlements";
import { notFound } from "next/navigation";
import { NextRequest } from "next/server";
import { getDb, demoEnabled } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { website } from "@/features/cms/service";
import { commerce } from "@/features/commerce/service";
import { seoFacts, platformUrl } from "@/features/seo/server";
import { siteUrls } from "@/features/seo/urls";
import { buildLlmsTxt, llmsEnabled } from "@/features/seo/llms";
export const dynamic = "force-dynamic";
/** Optional /llms.txt of a restaurant site (the proxy rewrites it on a custom domain). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurant: string }> },
) {
  const { restaurant } = await params;
  const data = await withDatabaseContext(
    { restaurantId: restaurant, public: true },
    () =>
      getDb().then((db) =>
        db.transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE atacuisine_app");
          if ((await restaurantPlan(tx, restaurant)) < 39) notFound();
          const cms = website(restaurant);
          const config = await cms.getPublishedConfig(tx);
          if (!llmsEnabled(config)) return null;
          const catalog = await commerce(restaurant)
            .catalog(tx)
            .catch(() => null);
          return {
            config,
            catalog,
            context: await cms.placeholderContext(tx, config),
            facts: await seoFacts(tx, restaurant),
          };
        }),
      ),
  ).catch(() => null);
  if (!data || demoEnabled())
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  const urls = siteUrls({
    restaurant,
    platformUrl: platformUrl(req.nextUrl.origin),
    primaryHost: data.facts.primaryHost,
    requestHost: req.headers.get("host") || req.nextUrl.host,
  });
  // Published on the canonical host only, like the sitemap.
  if (urls.mirror)
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  return new Response(
    buildLlmsTxt({
      config: data.config,
      context: data.context,
      canonicalBase: urls.canonicalBase,
      settings: data.catalog?.settings ?? null,
      products: data.catalog?.products ?? [],
      publishedAt: data.facts.publishedAt,
    }),
    {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=300",
        Vary: "Host",
      },
    },
  );
}
