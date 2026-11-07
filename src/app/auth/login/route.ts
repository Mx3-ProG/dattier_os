import { NextRequest, NextResponse } from "next/server";
import { beginLogin, safeReturnTo } from "@/lib/auth/oidc";
import { demoEnabled } from "@/lib/database/db";

export async function GET(req: NextRequest) {
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo") ?? undefined);
  if (demoEnabled()) {
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: `/demo?${new URLSearchParams({ returnTo })}`,
        "Cache-Control": "no-store",
      },
    });
  }
  try {
    return NextResponse.redirect(
      await beginLogin(
        returnTo,
        req.nextUrl.searchParams.get("mode") === "register",
      ),
    );
  } catch (error) {
    console.error("[auth] Démarrage OIDC impossible", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { error: "Service de connexion indisponible." },
      { status: 503 },
    );
  }
}
