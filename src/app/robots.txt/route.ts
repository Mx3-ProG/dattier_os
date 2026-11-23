import { demoEnabled } from "@/infrastructure/database/db";
import { platformRobots } from "@/features/seo/robots";
export const dynamic = "force-dynamic";
// Platform host only: on a restaurant domain the proxy rewrites /robots.txt to /r/{id}/robots.txt.
export function GET() {
  const sitemap = process.env.APP_URL
    ? new URL("/sitemap.xml", process.env.APP_URL).href
    : null;
  return new Response(
    platformRobots({ blockAll: demoEnabled(), sitemapUrl: sitemap }),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
