import test from "node:test";
import assert from "node:assert/strict";
import {
  legacyRestaurantModules,
  resolveModuleRuntime,
} from "../src/core/modules/runtime";
import { addonCatalog } from "../src/features/addons/catalog";

test("restaurant commercial mapping includes floor and booking in the single subscription", () => {
  assert.deepEqual(legacyRestaurantModules(0), []);
  assert.deepEqual(legacyRestaurantModules(39), ["floor", "table-booking"]);
  assert.deepEqual(legacyRestaurantModules(69), []);
  assert.deepEqual(legacyRestaurantModules(99), []);
  assert.deepEqual(legacyRestaurantModules(999), []);
  assert.equal(
    addonCatalog.find((addon) => addon.id === "floor")?.includedFrom,
    39,
  );
  assert.equal(
    addonCatalog.find((addon) => addon.id === "booking")?.includedFrom,
    39,
  );
});

test("module runtime requires entitlement and respects suspension, without a floor dependency", () => {
  assert.deepEqual(resolveModuleRuntime([], {}), [
    { id: "floor", available: false, reason: "not-entitled" },
    { id: "table-booking", available: false, reason: "not-entitled" },
  ]);
  // Les réservations fonctionnent sans plan de salle (migration 100).
  assert.deepEqual(resolveModuleRuntime(["table-booking"], {}), [
    { id: "floor", available: false, reason: "not-entitled" },
    { id: "table-booking", available: true, reason: "available" },
  ]);
  assert.deepEqual(
    resolveModuleRuntime(["floor", "table-booking"], { floor: "suspended" }),
    [
      { id: "floor", available: false, reason: "suspended" },
      { id: "table-booking", available: true, reason: "available" },
    ],
  );
  assert.deepEqual(
    resolveModuleRuntime(["floor", "table-booking"], { "table-booking": "suspended" }),
    [
      { id: "floor", available: true, reason: "available" },
      { id: "table-booking", available: false, reason: "suspended" },
    ],
  );
  assert.deepEqual(resolveModuleRuntime(["floor", "table-booking"], {}), [
    { id: "floor", available: true, reason: "available" },
    { id: "table-booking", available: true, reason: "available" },
  ]);
});

test("module runtime rejects unknown identifiers", () => {
  assert.throws(() => resolveModuleRuntime(["unknown"], {}), /Unknown module/);
  assert.throws(
    () => resolveModuleRuntime([], { unknown: "suspended" }),
    /Unknown module/,
  );
});
