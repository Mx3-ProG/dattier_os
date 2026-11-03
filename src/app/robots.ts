import type { MetadataRoute } from "next";
import { demoEnabled } from "@/lib/database/db";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: demoEnabled()
      ? { userAgent: "*", disallow: "/" }
      : {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/api/",
            "/auth/",
            "/restaurant/",
            "/platform",
            "/dashboard",
            "/offline",
            "/demo",
          ],
        },
  };
}
