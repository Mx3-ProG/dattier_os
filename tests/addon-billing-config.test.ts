import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { addonBillingReady, addonStripe, addonWebhook } from "../src/features/addons/billing-config";

test("add-on billing accepts live or test keys, never mixes modes, rejects unsigned events", () => {
  const key = process.env.STUDIO_BILLING_STRIPE_SECRET_KEY;
  const secret = process.env.STUDIO_BILLING_STRIPE_WEBHOOK_SECRET;
  try {
    delete process.env.STUDIO_BILLING_STRIPE_SECRET_KEY;
    delete process.env.STUDIO_BILLING_STRIPE_WEBHOOK_SECRET;
    assert.equal(addonBillingReady(), false);
    assert.throws(() => addonStripe());
    process.env.STUDIO_BILLING_STRIPE_SECRET_KEY = "pk_live_not_a_secret_key";
    assert.throws(() => addonStripe());
    process.env.STUDIO_BILLING_STRIPE_WEBHOOK_SECRET = "whsec_local_test";
    for (const keyLive of [false, true]) {
      process.env.STUDIO_BILLING_STRIPE_SECRET_KEY = keyLive ? "sk_live_fake" : "sk_test_fake";
      assert.equal(addonBillingReady(), true);
      for (const live of [false, true]) {
        const payload = JSON.stringify({id:"evt_test",type:"invoice.paid",livemode:live,data:{object:{}}});
        const header = Stripe.webhooks.generateTestHeaderString({payload,secret:"whsec_local_test"});
        if (live !== keyLive) assert.throws(() => addonWebhook(payload,header),/autre mode/);
        else assert.equal(addonWebhook(payload,header).id,"evt_test");
        assert.throws(() => addonWebhook(payload,"invalid"));
      }
    }
  } finally {
    if (key === undefined) delete process.env.STUDIO_BILLING_STRIPE_SECRET_KEY;
    else process.env.STUDIO_BILLING_STRIPE_SECRET_KEY = key;
    if (secret === undefined) delete process.env.STUDIO_BILLING_STRIPE_WEBHOOK_SECRET;
    else process.env.STUDIO_BILLING_STRIPE_WEBHOOK_SECRET = secret;
  }
});
