import { test } from "node:test";
import assert from "node:assert/strict";
import { bonusPlan, referralLevel, referralPricing } from "../src/features/platform/referrals";

test("parrainage : abonnement gratuit dès 3 filleuls", () => {
  assert.equal(referralPricing(39, 1, 2).total, 39);
  assert.equal(referralPricing(39, 1, 3).total, 0);
  assert.equal(referralPricing(0, 1, 50).total, 0);
});

test("parrainage : établissements offerts tous les 3 filleuls au-delà du palier", () => {
  assert.equal(referralPricing(39, 3, 2).total, 39 + 78, "avant le palier tout est facturé");
  assert.equal(referralPricing(39, 3, 3).total, 78);
  assert.equal(referralPricing(39, 3, 5).total, 78);
  assert.equal(referralPricing(39, 3, 6).total, 39);
  assert.equal(referralPricing(39, 3, 9).total, 0);
  assert.equal(referralPricing(39, 3, 30).freeSeats, 2, "jamais plus que les places existantes");
});

test("parrainage : prochain objectif", () => {
  assert.equal(bonusPlan(2), 0);
  assert.equal(bonusPlan(3), 39);
  assert.equal(bonusPlan(10), 39);
  assert.deepEqual(referralPricing(39, 1, 2).nextGoal, { kind: "free", target: 3, plan: 39 });
  assert.deepEqual(referralPricing(39, 2, 3).nextGoal, { kind: "seat", target: 6, plan: 39 });
  assert.equal(referralPricing(39, 1, 3).nextGoal, null);
});

test("parrainage : niveaux acquis à vie", () => {
  assert.equal(referralLevel(0).current, null);
  assert.equal(referralLevel(1).current?.name, "Bronze");
  assert.equal(referralLevel(4).current?.name, "Argent");
  assert.equal(referralLevel(4).next?.name, "Or");
  assert.equal(referralLevel(4).progress, 0.5);
  assert.equal(referralLevel(25).current?.name, "Légende");
  assert.equal(referralLevel(25).next, null);
});
