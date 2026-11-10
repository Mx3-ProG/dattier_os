import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/lib/auth/oidc";
import { reconcilePlanSession } from "@/features/platform/plan-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe Checkout success URL: refreshes access, then returns to the space. */
export async function GET(req: NextRequest) {
  let outcome = "verification";
  try {
    const result = await reconcilePlanSession(req.nextUrl.searchParams.get("session_id") || "");
    if (result && ["active", "trialing"].includes(String(result.status))) outcome = "ok";
  } catch (error) {
    // The signed webhook will still activate the subscription.
    console.error("[billing] Retour Checkout", error instanceof Error ? error.message : error);
  }
  return NextResponse.redirect(new URL(`/platform?abonnement=${outcome}`, appOrigin()), {
    headers: { "Cache-Control": "no-store" },
  });
}
