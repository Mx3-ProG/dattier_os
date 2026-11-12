import type { PaymentProvider } from "@/core/payments/provider";

export function createMockPaymentProvider(): PaymentProvider {
  return {
    async retrieveAccount(id) {
      return { id, status: "active" };
    },
    async createAccount() {
      return { id: `acct_mock_${Math.random().toString(36).slice(2, 10)}` };
    },
    async createAccountLink() {
      return { url: "https://mock.stripe/account-link" };
    },
    async createLoginLink() {
      return { url: "https://mock.stripe/login" };
    },
    async refund() {},
    async createCheckoutSession() {
      return { id: `cs_mock_${Date.now()}`, url: "https://mock.stripe/checkout" };
    },
    async retrievePaymentIntent() {
      return { latest_charge: { outcome: { risk_level: "normal" } } };
    },
    async createTransfer() {
      return { id: `tr_mock_${Date.now()}` };
    },
    async createTransferReversal() {},
    constructEvent(raw) {
      return JSON.parse(raw);
    },
  };
}
