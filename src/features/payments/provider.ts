/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import type { PaymentProvider } from "@/core/payments/provider";
import { createStripeProvider } from "@/infrastructure/payments/stripe-adapter";
import { createMockPaymentProvider } from "@/infrastructure/payments/mock-adapter";
import { paymentsSandbox, liveKey } from "./config";

let client: any = undefined;

export function setPaymentClient(fake: unknown) {
  client = fake;
}

/** Adapte un client Stripe (réel ou simulé injecté par les tests) au port. */
function fromClient(c: any): PaymentProvider {
  return {
    retrieveAccount: (id) => c.v2.core.accounts.retrieve(id, { include: ["configuration.recipient"] }).then((a: any) => {
      const capability = a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
      const status = capability === "active" ? "active" : capability === "restricted" ? "restricted" : "pending";
      return { id, status };
    }),
    createAccount: (params, key) => c.v2.core.accounts.create(params, { idempotencyKey: key }).then((x: any) => ({ id: x.id })),
    createAccountLink: (account, refreshUrl, returnUrl) => c.v2.core.accountLinks.create({ account, use_case: { type: "account_onboarding", account_onboarding: { refresh_url: refreshUrl, return_url: returnUrl } } }).then((x: any) => ({ url: x.url })),
    createLoginLink: (account) => c.accounts.createLoginLink(account).then((x: any) => ({ url: x.url })),
    refund: (pi, key) => c.refunds.create({ payment_intent: pi }, { idempotencyKey: key }).then(() => undefined),
    createCheckoutSession: (params, key) => c.checkout.sessions.create(params, { idempotencyKey: key }).then((x: any) => ({ id: x.id, url: x.url })),
    retrievePaymentIntent: (id) => c.paymentIntents.retrieve(id, { expand: ["latest_charge"] }).then((x: any) => ({ latest_charge: x.latest_charge })),
    createTransfer: (params, key) => c.transfers.create(params, { idempotencyKey: key }).then((x: any) => ({ id: x.id })),
    createTransferReversal: (transfer, amount, key) => c.transfers.createReversal(transfer, { amount }, { idempotencyKey: key }).then(() => undefined),
    constructEvent: (raw, signature) => {
      if (paymentsSandbox()) {
        try { return JSON.parse(raw); } catch { throw new Error("Signature Stripe invalide."); }
      }
      // delegate to config constructEvent via dynamic import to avoid cycle
      return (require("./config") as any).constructEvent(raw, signature);
    },
  };
}

export function getPaymentProvider(): PaymentProvider {
  if (paymentsSandbox()) return createMockPaymentProvider();
  if (client) return fromClient(client);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Paiement en ligne non configuré.");
  const live = liveKey(key);
  if (live && process.env.ATACUISINE_STRIPE_LIVE_APPROVED !== "true")
    throw new Error("Clé Stripe réelle refusée : validation juridique et comptable non confirmée.");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  return createStripeProvider(key, webhookSecret);
}
