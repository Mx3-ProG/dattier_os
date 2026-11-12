import test from "node:test";
import assert from "node:assert/strict";
import {
  arrangementDecision,
  compareArrangement,
} from "../src/features/floor/capabilities";
import { canArrange } from "../src/features/floor/access";
import type { DB } from "../src/infrastructure/database/db";
import { roles, can } from "../src/core/permissions";

test("all roles and individual overrides preserve floor arrangement permissions", () => {
  for (const role of roles)
    for (const override of [null, false, true]) {
      const expected =
        role === "OWNER" ||
        role === "SUPER_ADMIN" ||
        (can(role, "floor") && override !== false);
      assert.equal(
        compareArrangement([role], override, expected).matches,
        true,
      );
    }
  assert.equal(arrangementDecision(["CHEF", "WAITER"], null).allowed, true);
  assert.equal(arrangementDecision(["CHEF", "WAITER"], false).allowed, false);
  assert.equal(arrangementDecision([], true).allowed, false);
});
test("server comparison preserves scoped lookup and never grants an override to an unrelated role", async () => {
  const previous = process.env.STUDIO_OS_ENTITLEMENTS_SHADOW;
  process.env.STUDIO_OS_ENTITLEMENTS_SHADOW = "true";
  const calls: unknown[][] = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      calls.push(params);
      return { rows: [{ allowed: sql.includes("app.module_enabled") }] };
    },
  } as unknown as DB;
  try {
    assert.equal(
      await canArrange(db, "site-a", {
        id: "member",
        name: "Test",
        role: "WAITER",
      }),
      false,
    );
    assert.deepEqual(calls, [
      ["site-a", "floor"],
      ["site-a", "member"],
    ]);
    assert.equal(
      await canArrange(db, "site-a", {
        id: "owner",
        name: "Test",
        role: "OWNER",
      }),
      true,
    );
    assert.equal(
      await canArrange(db, "site-a", {
        id: "chef",
        name: "Test",
        role: "CHEF",
      }),
      false,
    );
    assert.equal(calls.length, 4);
  } finally {
    if (previous === undefined)
      delete process.env.STUDIO_OS_ENTITLEMENTS_SHADOW;
    else process.env.STUDIO_OS_ENTITLEMENTS_SHADOW = previous;
  }
});

test("staff capabilities preserve differences between kitchen, room and booking roles", async () => {
  const { staffFloorDecision, observeStaffFloor } =
    await import("../src/features/floor/capabilities");
  for (const role of roles) {
    assert.equal(
      staffFloorDecision("floor.view", [role]),
      can(role, "orders") || can(role, "reservations"),
    );
    assert.equal(
      staffFloorDecision("floor.status", [role]),
      can(role, "orders"),
    );
    assert.equal(
      staffFloorDecision("table-booking.manage", [role]),
      can(role, "reservations"),
    );
  }
  assert.equal(staffFloorDecision("floor.view", ["CHEF"]), true);
  assert.equal(staffFloorDecision("table-booking.manage", ["CHEF"]), false);
  assert.equal(
    staffFloorDecision("table-booking.manage", ["CHEF", "WAITER"]),
    true,
  );
  assert.equal(staffFloorDecision("floor.view", []), false);
  const previous = process.env.STUDIO_OS_ENTITLEMENTS_SHADOW;
  const original = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    process.env.STUDIO_OS_ENTITLEMENTS_SHADOW = "true";
    assert.equal(observeStaffFloor("floor.view", ["OWNER"], false), false);
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0], [
      "[studio-os] floor permission mismatch",
      { capability: "floor.view" },
    ]);
    process.env.STUDIO_OS_ENTITLEMENTS_SHADOW = "false";
    assert.equal(observeStaffFloor("floor.view", ["OWNER"], false), false);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = original;
    if (previous === undefined)
      delete process.env.STUDIO_OS_ENTITLEMENTS_SHADOW;
    else process.env.STUDIO_OS_ENTITLEMENTS_SHADOW = previous;
  }
});
