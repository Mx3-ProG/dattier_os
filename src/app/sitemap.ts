import type { MetadataRoute } from "next";
// Each restaurant publishes its own sitemap; the platform has no public directory.
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
