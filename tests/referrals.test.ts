import { test } from "node:test";
import assert from "node:assert/strict";
import { bonusPlan, referralLevel, referralPricing } from "../src/features/platform/referrals";

test("parrainage : paliers gratuits par forfait", () => {
  assert.equal(referralPricing(39, 1, 2).total, 39);
  assert.equal(referralPricing(39, 1, 3).total, 0);
  assert.equal(referralPricing(69, 1, 4).total, 69);
  assert.equal(referralPricing(69, 1, 5).total, 0);
  assert.equal(referralPricing(99, 1, 9).total, 99);
  assert.equal(referralPricing(99, 1, 10).total, 0);
  assert.equal(referralPricing(0, 1, 50).total, 0);
});

test("parrainage : établissements offerts tous les 3 filleuls au-delà du palier", () => {
  assert.equal(referralPricing(69, 3, 4).total, 69 + 78, "avant le palier tout est facturé");
  assert.equal(referralPricing(69, 3, 5).total, 78);
  assert.equal(referralPricing(69, 3, 7).total, 78);
  assert.equal(referralPricing(69, 3, 8).total, 39);
  assert.equal(referralPricing(69, 3, 11).total, 0);
  assert.equal(referralPricing(69, 3, 30).freeSeats, 2, "jamais plus que les places existantes");
});

test("parrainage : forfait supérieur débloqué et prochain objectif", () => {
  assert.equal(bonusPlan(2), 0);
  assert.equal(bonusPlan(3), 39);
  assert.equal(bonusPlan(5), 69);
  assert.equal(bonusPlan(10), 99);
  assert.equal(referralPricing(39, 1, 5).accessPlan, 69);
  assert.equal(referralPricing(69, 1, 10).accessPlan, 99);
  assert.deepEqual(referralPricing(69, 1, 2).nextGoal, { kind: "free", target: 5, plan: 69 });
  assert.deepEqual(referralPricing(69, 1, 5).nextGoal, { kind: "upgrade", target: 10, plan: 99 });
  assert.deepEqual(referralPricing(99, 2, 10).nextGoal, { kind: "seat", target: 13, plan: 99 });
  assert.equal(referralPricing(99, 1, 10).nextGoal, null);
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
