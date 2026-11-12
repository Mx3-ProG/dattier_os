import { NextRequest, NextResponse } from "next/server";
import { logout, appOrigin } from "@/infrastructure/auth/oidc";
import { demoEnabled } from "@/infrastructure/database/db";
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const local = demoEnabled() && origin &&
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/.test(origin) &&
    new URL(origin).host === req.headers.get("host");
  if (!local && origin !== appOrigin())
    return new NextResponse(null, { status: 403 });
  await logout();
  return NextResponse.redirect(new URL("/", local ? origin : appOrigin()), 303);
}
