import { NextRequest, NextResponse } from "next/server";
import { logout, appOrigin } from "@/lib/auth/oidc";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin())
    return new NextResponse(null, { status: 403 });
  await logout();
  return NextResponse.redirect(new URL("/", appOrigin()), 303);
}
