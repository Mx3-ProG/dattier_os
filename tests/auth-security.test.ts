import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { passwordProblem, passwordRules } from "../src/infrastructure/auth/password-policy";
import { checkSignupEmail, quickEmailCheck } from "../src/infrastructure/auth/disposable-email";
import { pwnedCount } from "../src/infrastructure/auth/breached-password";

process.env.DISPOSABLE_EMAIL_REMOTE_LIST = "false";

test("password policy: 12 chars, lower, upper, digit, special", () => {
  assert.match(passwordProblem("Court1!")!, /12 caractères/);
  assert.match(passwordProblem("toutenminuscule1!")!, /majuscule/);
  assert.match(passwordProblem("TOUTENMAJUSCULE1!")!, /minuscule/);
  assert.match(passwordProblem("SansChiffreIci!!")!, /chiffre/);
  assert.match(passwordProblem("SansSpecial12345")!, /spécial/);
  assert.equal(passwordProblem("Vq7#mLp2!xRt9z"), null);
});

test("password policy refuses guessable and oversized passwords", () => {
  assert.notEqual(passwordProblem("Motdepasse123!"), null);
  assert.notEqual(passwordProblem("Azerty123456!A"), null);
  assert.notEqual(passwordProblem("Aaaaa1!xyzQWE"), null);
  assert.notEqual(passwordProblem("Jean.Dupont42!", "jean.dupont@exemple.fr"), null);
  assert.notEqual(passwordProblem("Vq7# mLp2!xRt9z"), null);
  assert.match(passwordProblem("Aa1!" + "x".repeat(80))!, /trop long/);
  assert.equal(passwordRules("").every((r) => !r.ok), true);
});

test("disposable e-mails are refused, real and professional ones accepted", () => {
  for (const email of ["a@yopmail.com", "a@mailinator.com", "a@sub.guerrillamail.com", "a@my-tempmail-box.io", "a@10minutemail.com"])
    assert.equal(quickEmailCheck(email).ok, false, email);
  for (const email of ["a@example.com", "a@site.test", "pas-un-email", "a..b@gmail.com"])
    assert.equal(quickEmailCheck(email).ok, false, email);
  for (const email of ["Chef@Gmail.com", "contact@le-bistrot-du-port.fr", "jean@orange.fr", "compta@groupe-sa.co.uk"])
    assert.equal(quickEmailCheck(email).ok, true, email);
});

test("DNS: domains without mail servers or on disposable infrastructure are refused", async () => {
  const resolver = (mx: Record<string, string[]>, a: Record<string, string[]> = {}) => ({
    mx: async (d: string) => {
      if (!(d in mx)) throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
      return mx[d].map((exchange, priority) => ({ exchange, priority }));
    },
    a: async (d: string) => a[d] ?? [],
  });
  const r = resolver(
    { "restaurant-pro.fr": ["mx1.ovh.net"], "fresh-alias.xyz": ["mx.yopmail.com"], "nullmx.fr": ["."] },
    { "a-record-only.fr": ["1.2.3.4"] },
  );
  assert.equal((await checkSignupEmail("chef@restaurant-pro.fr", r)).ok, true);
  assert.equal((await checkSignupEmail("x@fresh-alias.xyz", r)).ok, false);
  assert.equal((await checkSignupEmail("x@nullmx.fr", r)).ok, false);
  assert.equal((await checkSignupEmail("x@nexistepas-du-tout.fr", r)).ok, false);
  assert.equal((await checkSignupEmail("x@a-record-only.fr", r)).ok, true);
  const outage = { mx: async () => { throw Object.assign(new Error("t"), { code: "ETIMEOUT" }); }, a: async () => [] };
  assert.equal((await checkSignupEmail("chef@restaurant-pro.fr", outage)).ok, true);
});

test("breach check sends only a 5-character SHA-1 prefix (k-anonymity)", async () => {
  const sha1 = createHash("sha1").update("Password123!").digest("hex").toUpperCase();
  let url = "";
  const fetcher = (async (input: string) => {
    url = input;
    return new Response(`${"0".repeat(35)}:0\n${sha1.slice(5)}:4242\n`);
  }) as unknown as typeof fetch;
  assert.equal(await pwnedCount("Password123!", fetcher), 4242);
  assert.equal(url.endsWith("/range/" + sha1.slice(0, 5)), true);
  assert.equal(url.includes("Password"), false);
  assert.equal(await pwnedCount("Vq7#mLp2!xRt9z-unique", fetcher), 0);
  const down = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
  assert.equal(await pwnedCount("x", down), null);
});
