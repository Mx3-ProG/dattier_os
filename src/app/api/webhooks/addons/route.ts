import { NextRequest } from "next/server";
import { addonWebhook } from "@/features/addons/billing-config";
import { handleAddonEvent } from "@/features/addons/webhook";
import { json } from "@/features/platform/http";
export const runtime = "nodejs";
/** Kept for existing Stripe endpoints; /api/webhooks/billing handles the same events. */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 1_000_000) return json({ error: "Notification trop volumineuse" }, 413);
    await handleAddonEvent(addonWebhook(raw, req.headers.get("stripe-signature") || ""));
    return json({ received: true });
  } catch {
    return json({ error: "Notification non traitée ; réessayer." }, 400);
  }
}
