import { NextRequest } from "next/server";
import { z } from "zod";
import { withRequestContext } from "@/features/ops-security/context";
import { assertOrigin, readBody, json, failure } from "@/features/platform/http";
import { planCheckout, planPortal } from "@/features/platform/plan-billing";

export const runtime = "nodejs";

const input = z.object({
  action: z.enum(["checkout", "portal"]),
  organization: z.string().min(1).max(150),
});

/** Opens Stripe Checkout (new subscription) or the Stripe customer portal. */
async function routePOST(req: NextRequest) {
  try {
    await assertOrigin(req);
    const { action, organization } = input.parse(await readBody(req, 2000));
    return json(action === "checkout" ? await planCheckout(organization) : await planPortal(organization));
  } catch (e) {
    console.error("[billing] Abonnement", e instanceof Error ? e.message : e);
    return failure(e);
  }
}

export const POST = withRequestContext("/api/platform/billing", routePOST);
