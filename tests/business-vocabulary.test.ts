import test from "node:test";
import assert from "node:assert/strict";
import { industries, isBusinessId } from "../src/core/tenant/business";
import { industries as onboardingIndustries } from "../src/features/onboarding/catalog";
import { legacyBusinessModules, legacyRestaurantModules } from "../src/core/modules/runtime";
import { moduleRegistry } from "../src/core/modules/catalog";

test("the business vocabulary lives in the core and stays compatible", () => {
  assert.equal(onboardingIndustries, industries);
  assert.equal(legacyRestaurantModules, legacyBusinessModules);
  assert.deepEqual(legacyBusinessModules(39), ["floor", "table-booking"]);
  assert.deepEqual(legacyBusinessModules(0), []);
});

test("business identifiers keep the historic restaurant id format", () => {
  assert.equal(isBusinessId("demo-bistro_1"), true);
  for (const value of ["", "a/b", "x".repeat(65), "é", null, 42]) assert.equal(isBusinessId(value), false);
});

test("module sectors are known business industries", () => {
  for (const definition of moduleRegistry.list())
    for (const industry of definition.industries) assert.ok((industries as readonly string[]).includes(industry));
});
