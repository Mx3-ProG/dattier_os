import { NextRequest, NextResponse } from "next/server";
import { logout, appOrigin } from "@/lib/auth/oidc";
import { demoEnabled } from "@/lib/database/db";
import { assertOrigin } from "@/features/platform/http";
export async function POST(req: NextRequest) {
  // The local demo may be opened on localhost or 127.0.0.1 (npm run dev).
  if (demoEnabled()) {
    try {
      await assertOrigin(req);
    } catch {
      return new NextResponse(null, { status: 403 });
    }
    await logout();
    return new NextResponse(null, { status: 303, headers: { Location: "/" } });
  }
  if (req.headers.get("origin") !== appOrigin())
    return new NextResponse(null, { status: 403 });
  await logout();
  return NextResponse.redirect(new URL("/", appOrigin()), 303);
}
