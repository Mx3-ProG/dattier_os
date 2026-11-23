/** Port de paiement. Le métier ne connaît jamais le fournisseur concret. */
export type PaymentAccount = {
  id: string;
  status?: string;
};

export type AccountLink = { url: string };
export type LoginLink = { url: string };
export type CheckoutSession = { id: string; url: string };
export type PaymentIntent = {
  latest_charge?: { outcome?: { risk_level?: string } } | null;
};
export type Transfer = { id: string };

export interface PaymentProvider {
  retrieveAccount(id: string): Promise<PaymentAccount>;
  createAccount(params: unknown, idempotencyKey: string): Promise<PaymentAccount>;
  createAccountLink(account: string, refreshUrl: string, returnUrl: string): Promise<AccountLink>;
  createLoginLink(account: string): Promise<LoginLink>;
  refund(paymentIntent: string, idempotencyKey: string): Promise<void>;
  createCheckoutSession(params: unknown, idempotencyKey: string): Promise<CheckoutSession>;
  retrievePaymentIntent(id: string): Promise<PaymentIntent>;
  createTransfer(params: unknown, idempotencyKey: string): Promise<Transfer>;
  createTransferReversal(transfer: string, amount: number, idempotencyKey: string): Promise<void>;
  constructEvent(raw: string, signature: string): unknown;
}
