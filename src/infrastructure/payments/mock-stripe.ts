/* eslint-disable @typescript-eslint/no-explicit-any */
/* Client Stripe simulé pour l’environnement fermé.
   Aucun appel réseau : les réponses sont déterministes et rejouables. */
export function createMockStripe() {
  const state = { accounts: new Map<string, { id: string; status: string }>() };
  const mock: any = {
    v2: {
      core: {
        accounts: {
          retrieve: async (id: string) => ({
            id,
            configuration: {
              recipient: {
                capabilities: {
                  stripe_balance: { stripe_transfers: { status: "active" } },
                },
              },
            },
          }),
          create: async () => {
            const id = `acct_mock_${Math.random().toString(36).slice(2, 10)}`;
            state.accounts.set(id, { id, status: "active" });
            return { id };
          },
        },
        accountLinks: {
          create: async () => ({ url: "https://mock.stripe/account-link" }),
        },
      },
    },
    accounts: {
      createLoginLink: async () => ({ url: "https://mock.stripe/login" }),
    },
    refunds: {
      create: async () => ({ id: `re_mock_${Date.now()}` }),
    },
    checkout: {
      sessions: {
        create: async () => ({
          id: `cs_mock_${Date.now()}`,
          url: "https://mock.stripe/checkout",
        }),
      },
    },
    paymentIntents: {
      retrieve: async (id: string) => ({
        id,
        latest_charge: { outcome: { risk_level: "normal" } },
      }),
    },
    transfers: {
      create: async () => ({ id: `tr_mock_${Date.now()}` }),
      createReversal: async () => ({ id: `rev_mock_${Date.now()}` }),
    },
    webhooks: {
      constructEvent: (raw: string) => JSON.parse(raw),
    },
  };
  return mock;
}
