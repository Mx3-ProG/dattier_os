import { NextRequest, NextResponse } from "next/server";
import { beginLogin, oidcConfigured, safeReturnTo } from "@/lib/auth/oidc";
import { supabaseConfigured } from "@/lib/auth/supabase";
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
  // Hosted production: e-mail + password pages backed by Supabase Auth.
  if (!oidcConfigured() && supabaseConfigured()) {
    const query = new URLSearchParams({ returnTo });
    if (req.nextUrl.searchParams.get("mode") === "register")
      query.set("mode", "register");
    return new NextResponse(null, {
      status: 307,
      headers: { Location: `/connexion?${query}`, "Cache-Control": "no-store" },
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
    console.error("[auth] Démarrage OIDC impossible", error instanceof Error ? error.message : "UnknownError");
    return NextResponse.json(
      { error: "Service de connexion indisponible." },
      { status: 503 },
    );
  }
}
