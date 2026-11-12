import { NextRequest } from "next/server";
import { z } from "zod";
import { withRequestContext } from "@/features/ops-security/context";
import { assertOrigin, readBody, json, failure } from "@/features/platform/http";
import { billingAccount, billingInvoices, capacityCheckout } from "@/features/platform/billing-account";
import { planCheckout, planPortal } from "@/features/platform/plan-billing";

export const runtime = "nodejs";

const input = z.object({
  action: z.enum(["checkout", "portal", "capacity"]),
  organization: z.string().min(1).max(150),
  quantity: z.number().int().min(2).max(100).optional(),
});

/** Opens Stripe Checkout (new subscription) or the Stripe customer portal. */
async function routePOST(req: NextRequest) {
  try {
    await assertOrigin(req);
    const { action, organization, quantity } = input.parse(await readBody(req, 2000));
    if(action === "capacity") {
      if(!quantity) throw new Error("Nombre de places requis.");
      return json(await capacityCheckout(organization,quantity));
    }
    return json(action === "checkout" ? await planCheckout(organization) : await planPortal(organization));
  } catch (e) {
    console.error("[billing] Abonnement", e instanceof Error ? e.message : e);
    return failure(e);
  }
}

export const POST = withRequestContext("/api/platform/billing", routePOST);

export const GET = withRequestContext("/api/platform/billing", async (req: NextRequest) => {
  try {
    const query = z.object({ organization:z.string().min(1).max(150), page:z.coerce.number().int().min(0).max(100000).default(0),
      source:z.string().min(1).max(150).optional(), cursor:z.string().regex(/^in_[A-Za-z0-9]+$/).optional()
    }).parse(Object.fromEntries(req.nextUrl.searchParams));
    return json(query.source ? await billingInvoices(query.organization,query.source,query.cursor) : await billingAccount(query.organization,query.page));
  } catch(e) { return failure(e); }
});
