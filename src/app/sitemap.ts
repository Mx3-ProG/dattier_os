import type { MetadataRoute } from "next";
import { demoEnabled } from "@/lib/database/db";
export const dynamic = "force-dynamic";
// Each restaurant publishes its own sitemap; the platform only lists its product page.
export default function sitemap(): MetadataRoute.Sitemap {
  if (demoEnabled() || !process.env.APP_URL) return [];
  return [{ url: new URL("/", process.env.APP_URL).href }];
}
