/* eslint-disable @typescript-eslint/no-explicit-any */
import Stripe from "stripe";
import type { PaymentProvider } from "@/core/payments/provider";

export function createStripeProvider(secretKey: string, webhookSecret: string): PaymentProvider {
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  return {
    async retrieveAccount(id) {
      const account = await stripe.v2.core.accounts.retrieve(id, { include: ["configuration.recipient"] });
      const capability = (account as any).configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
      const status = capability === "active" ? "active" : capability === "restricted" ? "restricted" : "pending";
      return { id, status };
    },
    async createAccount(params, idempotencyKey) {
      const created = await stripe.v2.core.accounts.create(params as any, { idempotencyKey });
      return { id: created.id };
    },
    async createAccountLink(account, refreshUrl, returnUrl) {
      const link = await stripe.v2.core.accountLinks.create({
        account,
        use_case: { type: "account_onboarding", account_onboarding: { refresh_url: refreshUrl, return_url: returnUrl } },
      } as any);
      return { url: (link as any).url };
    },
    async createLoginLink(account) {
      const link = await stripe.accounts.createLoginLink(account);
      return { url: link.url };
    },
    async refund(paymentIntent, idempotencyKey) {
      await stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey });
    },
    async createCheckoutSession(params, idempotencyKey) {
      const session = await stripe.checkout.sessions.create(params as any, { idempotencyKey });
      return { id: session.id, url: session.url! };
    },
    async retrievePaymentIntent(id) {
      const details = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
      return { latest_charge: details.latest_charge as any };
    },
    async createTransfer(params, idempotencyKey) {
      const transfer = await stripe.transfers.create(params as any, { idempotencyKey });
      return { id: transfer.id };
    },
    async createTransferReversal(transfer, amount, idempotencyKey) {
      await stripe.transfers.createReversal(transfer, { amount }, { idempotencyKey });
    },
    constructEvent(raw, signature) {
      if (!webhookSecret) throw new Error("Webhook non configuré.");
      return Stripe.webhooks.constructEvent(raw, signature, webhookSecret);
    },
  };
}
