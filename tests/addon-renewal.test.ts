import test from "node:test";
import assert from "node:assert/strict";
import { stopAddonRenewal } from "../src/features/addons/renewal";
const order = { id: "order", stripe_subscription: "sub_test" };
const subscription = () => ({
  id: "sub_test",
  livemode: false,
  status: "active",
  metadata: { addon_order: "order" },
  cancel_at_period_end: false,
  cancel_at: null as number | null,
  items: {
    data: [
      {
        price: { id: "price_test" },
        quantity: 1,
        current_period_end: 1900000000,
      },
    ],
  },
});
test("cancellation asks only for period-end and accepts an already scheduled stop without postponing it", async () => {
  const calls: unknown[] = [];
  const gateway = {
    retrieve: async () => subscription(),
    update: async (id: string, params: { cancel_at_period_end: true }) => {
      calls.push([id, params]);
      return { ...subscription(), cancel_at_period_end: true };
    },
  };
  await stopAddonRenewal(gateway, order, "price_test");
  assert.deepEqual(calls, [["sub_test", { cancel_at_period_end: true }]]);
  for (const pending of [
    { ...subscription(), cancel_at_period_end: true },
    { ...subscription(), cancel_at: 1900000000 },
  ]) {
    await stopAddonRenewal(
      {
        ...gateway,
        retrieve: async () => pending,
        update: async () => {
          throw new Error("must not postpone");
        },
      },
      order,
      "price_test",
    );
  }
  await stopAddonRenewal(
    {
      ...gateway,
      retrieve: async () => ({ ...subscription(), cancel_at: 1900001000 }),
    },
    order,
    "price_test",
  );
  assert.equal(
    calls.length,
    2,
    "a cancellation beyond this period still needs a period-end stop",
  );
});
test("cancellation verifies ownership, mode, product and status before mutation", async () => {
  const base = subscription();
  for (const invalid of [
    { ...base, livemode: true },
    { ...base, id: "other" },
    { ...base, metadata: { addon_order: "other" } },
    { ...base, status: "canceled" },
    { ...base, items: { data: [] } },
    {
      ...base,
      items: {
        data: [
          {
            price: { id: "wrong" },
            quantity: 1,
            current_period_end: 1900000000,
          },
        ],
      },
    },
    {
      ...base,
      items: {
        data: [
          {
            price: { id: "price_test" },
            quantity: 2,
            current_period_end: 1900000000,
          },
        ],
      },
    },
  ]) {
    let writes = 0;
    await assert.rejects(
      stopAddonRenewal(
        {
          retrieve: async () => invalid,
          update: async () => {
            writes++;
            return base;
          },
        },
        order,
        "price_test",
      ),
    );
    assert.equal(writes, 0);
  }
});
test("failed or unconfirmed Stripe cancellation is never reported as success", async () => {
  await assert.rejects(
    stopAddonRenewal(
      {
        retrieve: async () => subscription(),
        update: async () => {
          throw new Error("network unavailable");
        },
      },
      order,
      "price_test",
    ),
    /network/,
  );
  await assert.rejects(
    stopAddonRenewal(
      {
        retrieve: async () => subscription(),
        update: async () => subscription(),
      },
      order,
      "price_test",
    ),
    /confirmé/,
  );
});
