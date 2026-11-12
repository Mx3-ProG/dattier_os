import { renewalStopped, stopAddonRenewal } from "./renewal";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { addonStripe, addonBillingReady } from "./billing-config";
import { authenticated } from "@/features/platform/http";
import { one, rows } from "@/lib/database/db";
import { scope } from "@/lib/auth/session";
import { addonCatalog, addonPriceCents, monthlyAddonIds, type MonthlyAddonId } from "./catalog";
import { resolveMonthlyPrice, saasAutomaticTax, saasLive } from "@/features/billing/stripe-saas";
import { demoEnabled } from "@/lib/database/db";
export { monthlyAddonIds, type MonthlyAddonId } from "./catalog";
const addonEnv = (addon: MonthlyAddonId) =>
  `STUDIO_ADDON_${addon.replaceAll("-", "_").toUpperCase()}_PRICE_ID`;
/** Stripe price of a monthly add-on: env override, else found by product name. */
export const addonPriceId = (addon: MonthlyAddonId) =>
  resolveMonthlyPrice({
    env: addonEnv(addon),
    names: [addonCatalog.find((item) => item.id === addon)?.name ?? addon],
    cents: addonPriceCents(addon),
  });

export const addonCheckoutReady = (addon: MonthlyAddonId = "invoices") =>
  monthlyAddonIds.includes(addon) &&
  addonBillingReady() &&
  !!process.env.STUDIO_BILLING_DATABASE_URL;
async function readAddonState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await scope(db, user, restaurant);
    const state = await one<{ plan: number; admin: boolean }>(
      db,
      "SELECT app.restaurant_plan($1) AS plan,app.addon_store_manager($1) AS admin",
      [restaurant],
    );
    return {
      ...state,
      demo: Boolean(demoEnabled()),
      ready: addonCheckoutReady(),
      readyAddons: monthlyAddonIds.filter(addonCheckoutReady),
      subscriptions: await rows(
        db,
        "SELECT id,addon,status,valid_until,renewal_cancelled FROM addon_subscriptions WHERE restaurant_id=$1 ORDER BY created_at DESC",
        [restaurant],
      ),
      installations: await rows<{ addon_id: string; installed: boolean }>(
        db, "SELECT addon_id,installed FROM addon_installations WHERE restaurant_id=$1", [restaurant],
      ),
      storeLicenses: await rows<{ product_id: string; status: string; valid_until: string | null }>(
        db, "SELECT product_id,status,valid_until FROM addon_licenses WHERE restaurant_id=$1", [restaurant],
      ),
      legacyGrants: (await rows<{addon_id:string}>(db,
        "SELECT addon_id FROM addon_legacy_grants WHERE restaurant_id=$1",[restaurant])).map(row=>row.addon_id),
    };
  });
}
export async function addonState(restaurant: string) {
  const state = await readAddonState(restaurant);
  if (state.readyAddons.length && state.admin) {
    for (const subscription of state.subscriptions as {
      id: string;
      status: string;
      addon: string;
    }[]) {
      if (monthlyAddonIds.includes(subscription.addon as MonthlyAddonId) &&
          addonCheckoutReady(subscription.addon as MonthlyAddonId) &&
          (subscription.status === "pending" || subscription.status === "active"))
        await reconcileAddon(subscription.id);
    }
    return readAddonState(restaurant);
  }
  return state;
}
export async function addonCheckout(restaurant: string, addon: MonthlyAddonId = "invoices") {
  if (!monthlyAddonIds.includes(addon) || !addonCheckoutReady(addon))
    throw new Error("Le paiement en ligne des add-ons n’est pas encore configuré.");
  const stripe = addonStripe();
  const price = await stripe.prices.retrieve(await addonPriceId(addon));
  if (
    !price.active ||
    price.livemode !== saasLive() ||
    price.unit_amount !== addonPriceCents(addon) ||
    price.currency !== "eur" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.tax_behavior === "exclusive"
  )
    throw new Error(`Le tarif doit être de ${addonPriceCents(addon) / 100} € TTC par mois.`);
  const id = await authenticated(restaurant, async (db, user) => {
    await scope(db, user, restaurant);
    const state = await one<{ plan: number; admin: boolean }>(
      db,
      "SELECT app.restaurant_plan($1) AS plan,app.addon_store_manager($1) AS admin",
      [restaurant],
    );
    if (!state.admin)
      throw new Error("Achat réservé à l’administrateur de l’organisation.");
    const entitlement = await one<{entitled:boolean}>(db,"SELECT app.addon_entitled($1,$2) AS entitled",[restaurant,addon]);
    if (entitlement.entitled)
      throw new Error("Fonctionnalité déjà incluse dans votre forfait.");
    await db.query("SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [
      restaurant,
    ]);
    const existing = await rows<{ id: string; status: string }>(
      db,
      "SELECT id,status FROM addon_subscriptions WHERE restaurant_id=$1 AND addon=$2 AND status IN ('active','pending')",
      [restaurant,addon],
    );
    if (existing[0]?.status === "active")
      throw new Error("Cet add-on est déjà souscrit.");
    if (existing[0]) return existing[0].id;
    const id = randomUUID();
    await db.query(
      "INSERT INTO addon_subscriptions(id,restaurant_id,addon) VALUES($1,$2,$3)",
      [id, restaurant,addon],
    );
    return id;
  });
  const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3000").origin;
  const returnUrl = `${origin}/dashboard?restaurant=${encodeURIComponent(restaurant)}&module=addons`;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      line_items: [{ price: price.id, quantity: 1 }],
      ...(saasAutomaticTax() ? { automatic_tax: { enabled: true } } : {}),
      payment_method_collection: "always",
      locale: "fr",
      success_url: returnUrl,
      cancel_url: returnUrl,
      metadata: { addon_order: id, addon_id: addon },
      subscription_data: { metadata: { addon_order: id, addon_id: addon } },
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    },
    { idempotencyKey: addon === "invoices" ? `addon:${id}` : `addon:${addon}:${id}` },
  );
  await authenticated(restaurant, async (db) =>
    db.query("SELECT app.addon_session($1,$2)", [id, session.id]),
  );
  if (!session.url) throw new Error("Page de paiement indisponible.");
  return { url: session.url };
}

/** Dedicated billing DB role; never expose this connection to authenticated request bodies. */
export async function reconcileAddon(orderId: string) {
  const connection = process.env.STUDIO_BILLING_DATABASE_URL;
  if (!connection) throw new Error("Connexion de facturation indisponible.");
  const pool = new Pool({
    connectionString: connection,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM addon_subscriptions WHERE id=$1 FOR UPDATE",
      [orderId],
    );
    const order = rows[0];
    if (!order?.stripe_session) {
      await client.query("COMMIT");
      return;
    }
    const stripe = addonStripe();
    const session = await stripe.checkout.sessions.retrieve(
      order.stripe_session,
    );
    if (session.livemode !== saasLive() || session.metadata?.addon_order !== orderId)
      throw new Error("Session incompatible.");
    if (session.status === "expired") {
      await client.query(
        "SELECT app.addon_reconcile($1,$2,NULL,'expired',NULL)",
        [orderId, session.id],
      );
    } else if (session.status === "complete" && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id,
      );
      const item = sub.items.data[0];
      if (
        sub.livemode !== saasLive() ||
        sub.metadata.addon_order !== orderId ||
        sub.items.data.length !== 1 ||
        item.price.id !== (await addonPriceId(order.addon as MonthlyAddonId)) ||
        (sub.metadata.addon_id && sub.metadata.addon_id !== order.addon) ||
        item.quantity !== 1
      )
        throw new Error("Abonnement incompatible.");
      const latest = sub.latest_invoice;
      const invoice =
        typeof latest === "string"
          ? await stripe.invoices.retrieve(latest)
          : latest;
      const paid =
        session.payment_status === "paid" &&
        sub.status === "active" &&
        invoice?.status === "paid" &&
        invoice.livemode === saasLive();
      const until = new Date(item.current_period_end * 1000);
      await client.query("SELECT app.addon_reconcile($1,$2,$3,$4,$5)", [
        orderId,
        session.id,
        sub.id,
        paid ? "active" : "cancelled",
        paid ? until : null,
      ]);
      await client.query("SELECT app.addon_renewal($1,$2,$3)", [
        orderId,
        session.id,
        renewalStopped(sub),
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function cancelAddon(restaurant: string, addon: MonthlyAddonId = "invoices") {
  if (!monthlyAddonIds.includes(addon)) throw new Error("Add-on inconnu.");
  const subscription = await authenticated(restaurant, async (db, user) => {
    await scope(db, user, restaurant);
    const { admin } = await one<{ admin: boolean }>(
      db,
      "SELECT app.addon_store_manager($1) AS admin",
      [restaurant],
    );
    if (!admin)
      throw new Error(
        "Résiliation réservée à l’administrateur de l’organisation.",
      );
    return one<{ id: string; stripe_subscription: string }>(
      db,
      "SELECT id,stripe_subscription FROM addon_subscriptions WHERE restaurant_id=$1 AND addon=$2 AND status='active'",
      [restaurant,addon],
    );
  });
  await stopAddonRenewal(
    addonStripe().subscriptions,
    subscription,
    await addonPriceId(addon),
  );
  try {
    await reconcileAddon(subscription.id);
    return {
      message:
        "Renouvellement arrêté. L’accès est conservé jusqu’à la fin de la période payée.",
      state: await readAddonState(restaurant),
    };
  } catch {
    // Stripe already confirmed the request: do not report a failed cancellation.
    return {
      message:
        "Stripe a confirmé l’arrêt du renouvellement. L’actualisation de votre fiche est encore en cours.",
      state: null,
    };
  }
}
