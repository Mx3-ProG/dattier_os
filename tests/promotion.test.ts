import { test } from "node:test";
import assert from "node:assert/strict";
import { activePromotion, blackFriday, trialDays } from "../src/features/platform/promotion";

test("Black Friday ends at the configured deadline, keeping the standard seven-day trial", () => {
  const deadline = Date.parse(blackFriday.endsAt);
  assert.equal(deadline, Date.parse("2026-11-21T23:00:00Z"));
  assert.equal(activePromotion(new Date(deadline - 1))?.price, 9);
  assert.equal(activePromotion(new Date(deadline - 1))?.code, "BLACKFRIDAY");
  assert.equal(activePromotion(new Date(deadline)), null);
  assert.equal(trialDays(new Date(deadline - 1)), 7);
  assert.equal(trialDays(new Date(deadline)), 7);
});
