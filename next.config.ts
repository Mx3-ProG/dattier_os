import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Keep the bound origin for internal rewrites from restaurant domains.
  skipProxyUrlNormalize: true,
  // proxy.ts tronque les corps à 10 Mo par défaut ; l'éditeur accepte les vidéos jusqu'à 100 Mo.
  experimental: { proxyClientMaxBodySize: "101mb" },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
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
        ],
      },
      // Les pages reçoivent leur CSP du proxy, avec un nonce : plusieurs CSP s'additionnent,
      // cette base ne s'applique donc qu'à ce qui n'est pas une page.
      ...[
        "/api/:path*",
        "/_next/:path*",
        "/cms/:path*",
        "/fonts/:path*",
        "/favicon.ico",
        "/icon.svg",
        "/sw.js",
        "/manifest.webmanifest",
      ].map((source) => ({
        source,
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
        ],
      })),
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
