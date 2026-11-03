import { demoEnabled } from "@/lib/database/db";
import { renderSitemap } from "@/features/seo/sitemap";
export const dynamic = "force-dynamic";
/** Public pages of the Dattier OS platform itself (distinct from restaurant sites). */
export function GET() {
  const app = process.env.APP_URL;
  return new Response(
    renderSitemap(demoEnabled() || !app ? [] : [{ loc: new URL("/", app).href }]),
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
