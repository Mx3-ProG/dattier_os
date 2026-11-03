import { NextRequest, NextResponse } from "next/server";
import { beginLogin } from "@/lib/auth/oidc";
export async function GET(req: NextRequest) {
  try {
    return NextResponse.redirect(
      await beginLogin(req.nextUrl.searchParams.get("returnTo") || "/platform"),
    );
  } catch {
    return NextResponse.json(
      { error: "Service de connexion indisponible." },
      { status: 503 },
    );
  }
}
