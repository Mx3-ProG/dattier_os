import test from "node:test";
import assert from "node:assert/strict";
import { consentMaxAgeMs, parsePlatformConsent } from "../src/features/legal/consent";

const now = Date.parse("2026-11-10T12:00:00Z");
const value = (extra: object) =>
  JSON.stringify({ version: 1, audience: true, marketing: false, updatedAt: "2026-11-01T12:00:00Z", ...extra });

test("platform consent keeps a recent, well-formed choice", () => {
  assert.deepEqual(parsePlatformConsent(value({}), now), {
    version: 1,
    audience: true,
    marketing: false,
    updatedAt: "2026-11-01T12:00:00Z",
  });
});

test("platform consent asks again after six months or on malformed data", () => {
  const old = new Date(now - consentMaxAgeMs - 1000).toISOString();
  assert.equal(parsePlatformConsent(value({ updatedAt: old }), now), null);
  assert.equal(parsePlatformConsent(value({ updatedAt: "2027-01-01T00:00:00Z" }), now), null);
  assert.equal(parsePlatformConsent(value({ version: 2 }), now), null);
  assert.equal(parsePlatformConsent(value({ marketing: "yes" }), now), null);
  assert.equal(parsePlatformConsent("{broken", now), null);
  assert.equal(parsePlatformConsent(null, now), null);
});
