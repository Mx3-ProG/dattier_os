import { NextRequest, NextResponse } from "next/server";
import { finishLogin, appOrigin } from "@/lib/auth/oidc";
export async function GET(req: NextRequest) {
  try {
    const path = await finishLogin(
      req.nextUrl.searchParams.get("code") || "",
      req.nextUrl.searchParams.get("state") || "",
    );
    return NextResponse.redirect(new URL(path, appOrigin()));
  } catch {
    return NextResponse.json(
      { error: "Connexion refusée ou expirée. Recommencez la connexion." },
      { status: 401 },
    );
  }
}
