import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { activePromotion, blackFriday, trialDays } from "../src/features/platform/promotion";

test("Black Friday runs until Monday 16 November midnight, Paris time", () => {
  const before = new Date("2026-11-16T22:59:59Z"); // 23:59:59 à Paris
  const after = new Date("2026-11-16T23:00:00Z"); // 00:00 le 17 à Paris
  assert.equal(activePromotion(before)?.price, 9);
  assert.equal(activePromotion(before)?.code, "BLACKFRIDAY");
  assert.equal(trialDays(before), 7);
  assert.equal(activePromotion(after), null);
  assert.equal(trialDays(after), 3);
});

test("the trial migration uses the same end date as the site", async () => {
  const sql = await readFile("database/migrations/170_black_friday_trial.sql", "utf8");
  const end = sql.match(/timestamptz '([^']+)'/)?.[1];
  assert.ok(end);
  assert.equal(Date.parse(end.replace(" ", "T").replace(/\+01$/, "+01:00")), Date.parse(blackFriday.endsAt));
});
