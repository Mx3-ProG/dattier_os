import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roles, can, type Permission, type Role } from "../src/lib/permissions";
import { workspaceNavigation } from "../src/features/navigation/catalog";
import {
  createNavigation,
  currentNavigation,
  type NavigationContribution,
} from "../src/core/navigation/registry";
const legacy: {
  id: string;
  name: string;
  group: string;
  icon: string;
  permission: Permission | null;
}[] = JSON.parse(
  readFileSync(
    new URL("./fixtures/workspace-navigation-legacy.json", import.meta.url),
    "utf8",
  ),
);
const arranged = [
  ...legacy.filter((entry) => entry.id !== "addons" && entry.group === "PILOTAGE"),
  { id: "audience", name: "Statistiques du site", group: "PILOTAGE", icon: "Earth", permission: "analytics" as Permission },
  { id: "estimation", name: "Estimation", group: "PILOTAGE", icon: "Calculator", permission: "analytics" as Permission },
  ...legacy.filter((entry) => entry.id !== "addons" && entry.group !== "PILOTAGE"),
  legacy.find((entry) => entry.id === "addons")!,
];
test("navigation preserves existing entries and moves addons to the final Configuration group", () => {
  assert.equal(legacy.length, 29);
  assert.deepEqual(
    workspaceNavigation.list().map(({ id, name, group, icon, permission }) => ({
      id,
      name,
      group,
      icon,
      permission,
    })),
    arranged,
  );
});
test("navigation requires each independent paid add-on as well as the member role", () => {
  const profiles: (Role | Role[])[] = [
    ...roles,
    [],
    ["CHEF", "ACCOUNTANT"],
    ["WAITER", "MANAGER"],
  ];
  const paid: Record<string,string> = { qr:"qr", attendance:"attendance", hr:"attendance", billing:"client-invoices", invoices:"invoices", payroll:"payroll", customers:"loyalty" };
  for (const profile of profiles)
    for (const plan of [-1, 0, 39, 69, 99])
      for (const addons of [[], ["invoices"], ["bank"], ["invoices", "bank"]]) {
        const expected = arranged
          .filter(
            (m) =>
              !["audience", "estimation"].includes(m.id) &&
              (!paid[m.id] || addons.includes(paid[m.id])) &&
              (!m.permission ||
              ((plan >= 69 ||
                m.id === "invoices" || m.id === "billing" || m.id === "payroll" || m.id === "customers" ||
                !["finance", "customers", "website", "payroll"].includes(m.permission)) &&
                can(profile, m.permission))),
          )
          .map((m) => m.id);
        assert.deepEqual(
          workspaceNavigation
            .resolve({ roles: profile, plan, addons })
            .map((m) => m.id),
          expected,
          JSON.stringify({ profile, plan, addons }),
        );
      }
});
test("an invoice addon never bypasses role checks or unlocks bank and finance", () => {
  const accountant = workspaceNavigation
    .resolve({ roles: "ACCOUNTANT", plan: 39, addons: ["invoices"] })
    .map((m) => m.id);
  assert.ok(accountant.includes("invoices"));
  for (const id of ["overview", "bank", "finance", "billing"])
    assert.ok(!accountant.includes(id));
  assert.ok(
    !workspaceNavigation
      .resolve({ roles: "WAITER", plan: 39, addons: ["invoices"] })
      .some((m) => m.id === "invoices"),
  );
});
test("navigation registration rejects duplicates and isolates caller mutations", () => {
  const entry = workspaceNavigation.list()[0];
  assert.throws(() => createNavigation([entry, entry]), /duplicate/);
  assert.throws(
    () =>
      createNavigation([
        { ...entry, commercialCapability: "unknown" as never },
      ]),
    /capability/,
  );
  const source: NavigationContribution[] = [{ ...entry }];
  const registry = createNavigation(source);
  source[0].name = "changed";
  registry.list()[0].name = "changed again";
  registry.resolve({ roles: "OWNER", plan: 99 })[0].name = "changed again";
  assert.equal(registry.list()[0].name, entry.name);
});
test("current page preserves deep links, kitchen and bar defaults without inaccessible fallbacks", () => {
  for (const role of roles) {
    const entries = workspaceNavigation.resolve({ roles: role, plan: 99 });
    for (const requested of ["invoices", "kitchen", "unknown", "addons", ""]) {
      const expected =
        entries.find((m) => m.id === requested) ||
        entries.find(
          (m) =>
            m.id ===
            (role === "CHEF" ? "kitchen" : role === "BARTENDER" ? "bar" : ""),
        ) ||
        entries.find((m) => m.id !== "addons") ||
        entries[0];
      assert.deepEqual(currentNavigation(entries, requested, role), expected);
    }
  }
  assert.equal(currentNavigation([], "invoices", "OWNER"), undefined);
});

test("suspended floor and table booking disappear from navigation", () => {
  const entries = workspaceNavigation.resolve({
    plan: 39,
    roles: "OWNER",
    activeModules: { floor: false, "table-booking": false },
  });
  assert.equal(entries.some((entry) => entry.id === "dining"), false);
  assert.equal(entries.some((entry) => entry.id === "reservations"), false);
  assert.equal(entries.some((entry) => entry.id === "orders"), true);
});
