import test from "node:test";
import assert from "node:assert/strict";
import { classifyCustomer } from "../src/domain/crm/segments";

const now = Date.parse("2026-11-12T12:00:00Z");
const base = { marketingConsent: false, emailAvailable: true };

test("les segments distinguent absence d'achat, fidélité et inactivité", () => {
  assert.deepEqual(classifyCustomer({ ...base, paidOrders: 0, lastPaidAt: null }, now), { segment: "new", emailEligible: false });
  assert.equal(classifyCustomer({ ...base, paidOrders: 1, lastPaidAt: "2026-11-01T12:00:00Z" }, now).segment, "active");
  assert.equal(classifyCustomer({ ...base, paidOrders: 3, lastPaidAt: "2026-11-01T12:00:00Z" }, now).segment, "loyal");
  assert.equal(classifyCustomer({ ...base, paidOrders: 6, lastPaidAt: "2026-07-01T12:00:00Z" }, now).segment, "dormant");
});

test("un segment ne suffit pas à autoriser un e-mail marketing", () => {
  assert.equal(classifyCustomer({ paidOrders: 3, lastPaidAt: "2026-11-01T12:00:00Z", marketingConsent: true, emailAvailable: false }, now).emailEligible, false);
  assert.equal(classifyCustomer({ paidOrders: 3, lastPaidAt: "2026-11-01T12:00:00Z", marketingConsent: true, emailAvailable: true }, now).emailEligible, true);
});
