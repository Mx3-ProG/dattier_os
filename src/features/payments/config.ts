/* Paramètres et accès Stripe. Aucune clé ne quitte le serveur.
   Mode test par défaut : les clés réelles sont refusées tant que la validation
   juridique et comptable n’a pas été confirmée par l’opérateur. */
import Stripe from "stripe";
import type { DB } from "@/lib/database/db";

const number = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return process.env[name] && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
};
/** Commission de la plateforme, en points de base : 700 = 7 %. */
export const commissionBp = () => number("ATACUISINE_COMMISSION_BP", 700);
/** Estimation des frais Stripe retenus au restaurant. Les frais réels varient. */
export const stripeFeeBp = () => number("ATACUISINE_STRIPE_FEE_BP", 300);
/** Délai interne avant versement. Choix de la plateforme, pas une obligation légale. */
export const holdDays = () => number("ATACUISINE_PAYOUT_HOLD_DAYS", 31);

/** Montant minimal accepté pour un paiement en ligne, en centimes. */
export const minimumOnlineAmount = 50;

export function splitAmount(
  gross: number,
  commission = commissionBp(),
  fee = stripeFeeBp(),
) {
  const commissionAmount = Math.round((gross * commission) / 10000),
    stripeFeeEstimate = Math.round((gross * fee) / 10000);
  return {
    commission: commissionAmount,
    stripeFeeEstimate,
    net: gross - commissionAmount - stripeFeeEstimate,
  };
}

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
export const liveKey = (key: string) => /^(sk|rk)_live_/.test(key);

let client: Stripe | undefined;
/** Remplace le client Stripe pendant les tests. */
export function setStripeClient(fake: unknown) {
  client = fake as Stripe | undefined;
}
export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Paiement en ligne non configuré.");
  if (liveKey(key) && process.env.ATACUISINE_STRIPE_LIVE_APPROVED !== "true")
    throw new Error(
      "Clé Stripe réelle refusée : validation juridique et comptable non confirmée.",
    );
  client = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}
export function constructEvent(raw: string, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Webhook non configuré.");
  try {
    return Stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    throw new Error("Signature Stripe invalide.");
  }
}
/** Le paiement en ligne est-il proposé par cet établissement ? */
export async function onlineReady(db: DB, restaurant: string) {
  if (!stripeEnabled()) return false;
  const result = await db.query<{ ready: boolean }>(
    "SELECT app.online_ready($1) AS ready",
    [restaurant],
  );
  return !!result.rows[0]?.ready;
}
