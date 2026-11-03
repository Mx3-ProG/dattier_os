import { NextRequest, NextResponse } from "next/server";
import { getDb, productionEnabled } from "@/lib/database/db";
export async function proxy(req: NextRequest) {
  if (
    !productionEnabled() ||
    ["/api/health", "/robots.txt"].includes(req.nextUrl.pathname)
  )
    return NextResponse.next();
  const host = new URL(
    `http://${req.headers.get("host") || req.nextUrl.host}`,
  ).hostname.toLowerCase();
  const platform = new URL(process.env.APP_URL || "http://localhost:3000")
    .hostname;
  if (host === platform) return NextResponse.next();
  try {
    const { rows } = await (
      await getDb()
    ).query<{ restaurant: string | null }>(
      "SELECT app.resolve_domain($1) AS restaurant",
      [host],
    );
    const r = rows[0]?.restaurant;
    if (!r) return new NextResponse("Domaine non configuré.", { status: 404 });
    if (
      req.nextUrl.pathname === `/r/${r}` ||
      req.nextUrl.pathname.startsWith(`/r/${r}/`)
    )
      return NextResponse.next();
    if (req.nextUrl.pathname.startsWith("/r/"))
      return new NextResponse("Établissement non autorisé.", { status: 403 });
    if (/^\/(restaurant|platform|dashboard)(\/|$)/.test(req.nextUrl.pathname))
      return NextResponse.redirect(
        new URL(`/restaurant/${r}`, process.env.APP_URL),
      );
    const tenantApi = req.nextUrl.pathname.match(
      /^\/api\/(?:store|cms|ops-security|restaurants)\/([^/]+)/,
    );
    if (
      req.nextUrl.pathname.startsWith("/api/") &&
      (!tenantApi || decodeURIComponent(tenantApi[1]) !== r)
    )
      return new NextResponse("Établissement non autorisé.", { status: 403 });
    if (
      req.nextUrl.pathname.startsWith("/api/") ||
      req.nextUrl.pathname.startsWith("/_next/") ||
      req.nextUrl.pathname === "/source"
    )
      return NextResponse.next();
    if (req.nextUrl.pathname.startsWith("/auth/")) {
      return NextResponse.redirect(
        new URL(
          `/auth/login?returnTo=${encodeURIComponent(`/r/${r}/account`)}`,
          process.env.APP_URL,
        ),
      );
    }
    return NextResponse.rewrite(
      new URL(
        `/r/${r}${req.nextUrl.pathname === "/" ? "" : req.nextUrl.pathname}`,
        req.url,
      ),
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
