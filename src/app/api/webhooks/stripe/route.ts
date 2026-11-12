import { NextRequest } from "next/server";
import Stripe from "stripe";
import { recordFailure } from "@/features/ops-security/http";
import { withRequestContext } from "@/features/ops-security/context";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { getDb, one } from "@/infrastructure/database/db";
import { json } from "@/features/platform/http";
import { getPaymentProvider } from "@/features/payments/provider";
import {
  isHandled,
  minimalEvent,
  queueEvent,
} from "@/features/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vérifie la signature, dépose la notification, répond vite. Le worker la traite. */
async function routePOST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 1_000_000) return json({ error: "Trop volumineux." }, 413);
    const event = getPaymentProvider().constructEvent(
      raw,
      req.headers.get("stripe-signature") || "",
    ) as Stripe.Event;
    if (!isHandled(event.type)) return json({ received: true });
    const minimal = minimalEvent(event);
    const db = await getDb();
    const restaurant =
      minimal.object.restaurant ??
      (
        await one<{ id: string | null }>(
          db,
          "SELECT app.online_restaurant_for($1) AS id",
          [String(minimal.object.payment_intent ?? "")],
        )
      ).id;
    // Paiement étranger à la boutique : rien à traiter, inutile que Stripe réessaie.
    if (!restaurant) return json({ received: true });
    await withDatabaseContext({ restaurantId: restaurant, public: true }, () =>
      db.transaction((tx) => queueEvent(tx, restaurant, minimal)),
    );
    return json({ received: true });
  } catch (e) {
    await recordFailure(e, { endpoint: "/api/webhooks/stripe", status: 400 });
    return json({ error: "Notification refusée." }, 400);
  }
}

export const POST = withRequestContext("/api/webhooks/stripe", routePOST);
