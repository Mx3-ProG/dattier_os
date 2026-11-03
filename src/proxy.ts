import { NextRequest, NextResponse } from "next/server";
import { getDb, productionEnabled } from "@/lib/database/db";
import { SITE_HEADER } from "@/features/seo/locale";
/** Request headers forwarded to the app: the site header is always set by us, never by the client. */
function forwarded(req: NextRequest, restaurant: string | null) {
  // Nothing to set or strip: forward the request untouched.
  if (!restaurant && !req.headers.has(SITE_HEADER)) return undefined;
  const headers = new Headers(req.headers);
  headers.delete(SITE_HEADER);
  if (restaurant) headers.set(SITE_HEADER, restaurant);
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
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!productionEnabled() || pathname === "/api/health")
    return NextResponse.next(forwarded(req, sitePath(pathname)));
  const host = new URL(
    `http://${req.headers.get("host") || req.nextUrl.host}`,
  ).hostname.toLowerCase();
  const app = new URL(process.env.APP_URL || "http://localhost:3000");
  if (host === app.hostname)
    return NextResponse.next(forwarded(req, sitePath(pathname)));
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
      return NextResponse.next(forwarded(req, r));
    if (pathname.startsWith("/r/"))
      return new NextResponse("Établissement non autorisé.", { status: 403 });
    if (/^\/(restaurant|platform|dashboard)(\/|$)/.test(pathname))
      return NextResponse.redirect(new URL(`/restaurant/${r}`, process.env.APP_URL));
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
      pathname === "/source"
    )
      return NextResponse.next(forwarded(req, null));
    if (pathname.startsWith("/auth/")) {
      return NextResponse.redirect(
        new URL(
          `/auth/login?returnTo=${encodeURIComponent(`/r/${r}/account`)}`,
          process.env.APP_URL,
        ),
      );
    }
    return NextResponse.rewrite(
      new URL(`/r/${r}${pathname === "/" ? "" : pathname}`, req.url),
      forwarded(req, r),
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
