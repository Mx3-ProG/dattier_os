import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, portions } from "../src/lib/domain";
import { can, requirePermission } from "../src/lib/permissions";
test("conversions explicites, incompatibilités et portions limitantes", () => {
  assert.equal(convert(2, "kg", "g"), 2000);
  assert.equal(convert(300, "ml", "l"), 0.3);
  assert.throws(() => convert(1, "g", "ml"));
  assert.throws(() => convert(-2, "kg", "g"));
  assert.equal(
    portions([
      { available: 1000, quantity: 200 },
      { available: 300, quantity: 150 },
    ]),
    2,
  );
  assert.equal(portions([]), 0);
});
test("RBAC métier", () => {
  assert.equal(can("WAITER", "finance"), false);
  assert.equal(can("CHEF", "bar"), false);
  assert.equal(can("OWNER", "finance"), true);
  assert.throws(() => requirePermission("BARTENDER", "payments"));
});
