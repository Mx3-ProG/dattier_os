import { NextRequest, NextResponse } from "next/server";
import { getDb, productionEnabled } from "@/lib/database/db";
import { SITE_HEADER } from "@/features/seo/locale";
import {
  contentSecurityPolicy,
  createNonce,
  CSP_REPORT_PATH,
  cspHeaderName,
  cspMode,
  isSitePath,
  NONCE_HEADER,
} from "@/lib/security/csp";
type PageSecurity = { nonce: string; header: string; policy: string } | null;
/** Request headers forwarded to the app: site and nonce headers are always set by us, never by the client. */
function forwarded(
  req: NextRequest,
  restaurant: string | null,
  security: PageSecurity,
) {
  // Nothing to set or strip: forward the request untouched.
  if (
    !restaurant &&
    !security &&
    !req.headers.has(SITE_HEADER) &&
    !req.headers.has(NONCE_HEADER)
  )
    return undefined;
  const headers = new Headers(req.headers);
  headers.delete(SITE_HEADER);
  headers.delete(NONCE_HEADER);
  if (restaurant) headers.set(SITE_HEADER, restaurant);
  if (security) {
    headers.set(NONCE_HEADER, security.nonce);
    // Next.js extracts the nonce from this request header for its own scripts.
    headers.set(security.header, security.policy);
  }
  return { request: { headers } };
}
function sitePath(pathname: string) {
  const m = pathname.match(/^\/r\/([^/]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
/** API responses are not documents: next.config.ts gives them a fixed baseline. */
function pageSecurity(req: NextRequest, tenantHost: boolean): PageSecurity {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) return null;
  const nonce = createNonce();
  return {
    nonce,
    header: cspHeaderName(cspMode(process.env.CSP_MODE)),
    policy: contentSecurityPolicy({
      nonce,
      kind: tenantHost || isSitePath(pathname) ? "site" : "platform",
      dev: process.env.NODE_ENV === "development",
    }),
  };
}
export async function proxy(req: NextRequest) {
  const host = new URL(
    `http://${req.headers.get("host") || req.nextUrl.host}`,
  ).hostname.toLowerCase();
  const app = new URL(process.env.APP_URL || "http://localhost:3000");
  const tenantHost = productionEnabled() && host !== app.hostname;
  const security = pageSecurity(req, tenantHost);
  const response = await route(req, host, app, security);
  if (security) response.headers.set(security.header, security.policy);
  return response;
}
async function route(
  req: NextRequest,
  host: string,
  app: URL,
  security: PageSecurity,
) {
  const { pathname, search } = req.nextUrl;
  if (!productionEnabled() || pathname === "/api/health")
    return NextResponse.next(forwarded(req, sitePath(pathname), security));
  if (pathname === CSP_REPORT_PATH) return NextResponse.next();
  if (host === app.hostname)
    return NextResponse.next(forwarded(req, sitePath(pathname), security));
  try {
    const { rows } = await (
      await getDb()
    ).query<{ restaurant: string | null; primary: string | null }>(
      "SELECT d.r AS restaurant,app.primary_domain(d.r) AS primary FROM (SELECT app.resolve_domain($1) AS r) d",
      [host],
    );
    const r = rows[0]?.restaurant;
    if (!r) return new NextResponse("Domaine non configuré.", { status: 404 });
    // Secondary verified domains send visitors and crawlers to the primary one.
    const primary = rows[0]?.primary;
    if (primary && primary !== host && !pathname.startsWith("/api/"))
      return NextResponse.redirect(
        `${app.protocol}//${primary}${pathname}${search}`,
        308,
      );
    if (pathname === `/r/${r}` || pathname.startsWith(`/r/${r}/`))
      return NextResponse.next(forwarded(req, r, security));
    if (pathname.startsWith("/r/"))
      return new NextResponse("Établissement non autorisé.", { status: 403 });
    if (/^\/(restaurant|platform|dashboard)(\/|$)/.test(pathname))
      return NextResponse.redirect(
        new URL(`/restaurant/${r}`, process.env.APP_URL),
      );
    // Collecteur d’audience : l’établissement est résolu côté serveur à partir de ce domaine.
    if (pathname === "/api/analytics/collect")
      return NextResponse.next(forwarded(req, null));
    const tenantApi = pathname.match(
      /^\/api\/(?:store|cms|ops-security|restaurants)\/([^/]+)/,
    );
    if (
      pathname.startsWith("/api/") &&
      (!tenantApi || decodeURIComponent(tenantApi[1]) !== r)
    )
      return new NextResponse("Établissement non autorisé.", { status: 403 });
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/q/") ||
      pathname === "/source"
    )
      return NextResponse.next(forwarded(req, null, security));
    if (pathname.startsWith("/auth/")) {
      return NextResponse.redirect(
        new URL(
          `/auth/login?returnTo=${encodeURIComponent(`/r/${r}/account`)}`,
          process.env.APP_URL,
        ),
      );
    }
    return NextResponse.rewrite(
      new URL(`/r/${r}${pathname === "/" ? "" : pathname}${search}`, req.url),
      forwarded(req, r, security),
    );
  } catch {
    return new NextResponse("Site temporairement indisponible.", {
      status: 503,
    });
  }
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|cms/|fonts/|favicon.ico|icon.svg|sw.js|manifest.webmanifest).*)",
  ],
};
