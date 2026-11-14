import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Démo publique : l’instantané et les migrations sont lus au démarrage de chaque fonction.
  ...(process.env.ATACUISINE_PUBLIC_DEMO === "true" && {
    outputFileTracingIncludes: {
      "/**": ["./database/demo-snapshot/**", "./database/migrations/**"],
    },
  }),
  // Keep the bound origin for internal rewrites from restaurant domains.
  skipProxyUrlNormalize: true,
  // proxy.ts tronque les corps à 10 Mo par défaut ; l'éditeur accepte les vidéos jusqu'à 100 Mo.
  experimental: { proxyClientMaxBodySize: "101mb" },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/api/media/:path*",
        headers: [{ key: "X-Robots-Tag", value: "all" }],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
      {
        source: "/avantage",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};
export default config;
