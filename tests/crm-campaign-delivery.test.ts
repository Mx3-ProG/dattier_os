import test from "node:test";
import assert from "node:assert/strict";
import { recipientStillEligible } from "../src/features/pilotage-addons/campaign-delivery";

const recipient = { recipient: "client@example.test", contact: "client@example.test", account_email: null, consent: true, marketing_consent: null };

test("une campagne écarte les destinataires dont l'accord ou l'adresse a changé", () => {
  assert.equal(recipientStillEligible(recipient), true);
  assert.equal(recipientStillEligible({ ...recipient, consent: false }), false);
  assert.equal(recipientStillEligible({ ...recipient, contact: "nouveau@example.test" }), false);
  assert.equal(recipientStillEligible({ ...recipient, contact: "0600000000", account_email: "client@example.test" }), true);
});
