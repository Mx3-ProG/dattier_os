import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/carte", "/reservations", "/contact"].map((p) => ({
    url: `http://localhost:3000${p}`,
  }));
}
