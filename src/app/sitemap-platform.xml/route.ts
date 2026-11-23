import { demoEnabled } from "@/infrastructure/database/db";
import { renderSitemap } from "@/features/seo/sitemap";
export const dynamic = "force-dynamic";
/** Public pages of the atacuisine platform itself (distinct from restaurant sites). */
export function GET() {
  const app = process.env.APP_URL;
  return new Response(
    renderSitemap(
      demoEnabled() || !app
        ? []
        : ["/", "/guide", "/cgu", "/confidentialite", "/cookies", "/mentions-legales"].map((path) => ({ loc: new URL(path, app).href })),
    ),
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
