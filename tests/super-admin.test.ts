import { test } from "node:test";
import assert from "node:assert/strict";
import { isSuperAdminEmail } from "../src/infrastructure/auth/superadmin";
import { can, requirePermission } from "../src/core/permissions";
import { scope } from "../src/infrastructure/auth/session";
import { assertSuperAdmin } from "../src/features/admin/service";
import type { DB } from "../src/infrastructure/database/types";

test("super admin email recognition for mat75.deff@gmail.com", () => {
  assert.equal(isSuperAdminEmail("mat75.deff@gmail.com"), true);
  assert.equal(isSuperAdminEmail("MAT75.DEFF@GMAIL.COM"), true);
  assert.equal(isSuperAdminEmail("  mat75.deff@gmail.com  "), true);
  assert.equal(isSuperAdminEmail("other@restaurant.fr"), false);
  assert.equal(isSuperAdminEmail(""), false);
  assert.equal(isSuperAdminEmail(undefined), false);
});

test("super admin permissions: full access across all capabilities", () => {
  const allPermissions = [
    "security",
    "website",
    "catalog",
    "payments",
    "orders",
    "kitchen",
    "bar",
    "stock",
    "purchases",
    "finance",
    "team",
    "customers",
    "settings",
    "audit",
    "reservations",
    "floor",
    "payroll",
    "analytics",
  ] as const;

  for (const perm of allPermissions) {
    assert.equal(
      can("SUPER_ADMIN", perm),
      true,
      `Super Admin must have permission: ${perm}`,
    );
    assert.doesNotThrow(() => requirePermission("SUPER_ADMIN", perm));
  }
});

test("scope grants automatic full access on any establishment for super admin", async () => {
  const dummyDb: DB = {
    query: async () => ({ rows: [] }),
    exec: async () => {},
  };

  const superAdminActor = {
    id: "mat75_id",
    name: "Mathieu",
    email: "mat75.deff@gmail.com",
    role: "SUPER_ADMIN" as const,
  };

  const result = await scope(dummyDb, superAdminActor, "any-unknown-restaurant-id");
  assert.equal(result.role, "SUPER_ADMIN");
  assert.deepEqual(result.roles, ["SUPER_ADMIN", "OWNER"]);
});

test("assertSuperAdmin validates super admin and throws for non-admin", async () => {
  const dummyDb: DB = {
    query: async () => ({ rows: [] }),
    exec: async () => {},
  };

  const superAdmin = {
    id: "admin_1",
    name: "Mathieu",
    email: "mat75.deff@gmail.com",
    role: "SUPER_ADMIN" as const,
  };

  await assert.doesNotReject(() => assertSuperAdmin(dummyDb, superAdmin));

  const regularUser = {
    id: "user_2",
    name: "Camille",
    email: "camille@example.test",
    role: "WAITER" as const,
  };

  await assert.rejects(
    () => assertSuperAdmin(dummyDb, regularUser),
    /privilèges Super Admin requis/,
  );
});
