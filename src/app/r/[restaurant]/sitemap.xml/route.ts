import { NextRequest } from "next/server";
import { getDb, demoEnabled } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { website } from "@/features/cms/service";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurant: string }> },
) {
  const { restaurant } = await params;
  const config = await withDatabaseContext(
    { restaurantId: restaurant, public: true },
    () =>
      getDb().then((db) =>
        db.transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE dattier_app");
          return website(restaurant).getPublishedConfig(tx);
        }),
      ),
  );
  const platform = new URL(process.env.APP_URL || req.url).hostname;
  const hostname = new URL(
    `http://${req.headers.get("host") || req.nextUrl.host}`,
  );
  const origin = `${new URL(process.env.APP_URL || req.url).protocol}//${hostname.host}`;
  const base =
    hostname.hostname === platform
      ? `${origin}/r/${encodeURIComponent(restaurant)}`
      : origin;
  const pages =
    demoEnabled() || config.seo.noIndex !== false
      ? []
      : Object.entries(config.pages).filter(
          ([, p]) => p.visible && p.kind !== "protected" && !p.seo.noIndex,
        );
  const escape = (s: string) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(([key]) => `<url><loc>${escape(base + (key === "home" ? "" : "/" + encodeURIComponent(key)))}</loc></url>`).join("")}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "no-cache",
      },
    },
  );
}
