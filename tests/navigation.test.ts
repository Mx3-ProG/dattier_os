import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roles, can, type Permission, type Role } from "../src/core/permissions";
import { workspaceNavigation } from "../src/features/navigation/catalog";
import { tradeToolNavigation } from "../src/features/trade/navigation";
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
  { id: "prospect-scanner", name: "Scanner de prospects", group: "PILOTAGE", icon: "Activity", permission: "analytics" as Permission },
  { id: "pipeline-crm", name: "Pipeline CRM", group: "PILOTAGE", icon: "ClipboardList", permission: "analytics" as Permission },
  { id: "customer-health", name: "Customer Health", group: "PILOTAGE", icon: "Heart", permission: "customers" as Permission },
  // Chaque outil métier a son entrée dans OPÉRATIONS, après les réservations.
  ...legacy.filter((entry) => entry.id !== "addons" && entry.group !== "PILOTAGE").flatMap((entry) =>
    entry.id === "reservations"
      ? [entry, ...tradeToolNavigation.map(({ id, name, group, icon, permission }) => ({ id, name, group, icon, permission }))]
      : [entry],
  ),
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
  const paid: Record<string,string> = { qr:"qr", attendance:"attendance", hr:"attendance", billing:"client-invoices", invoices:"invoices", payroll:"payroll", customers:"loyalty", "prospect-scanner":"prospect-scanner", "pipeline-crm":"pipeline-crm", "customer-health":"customer-health" };
  for (const profile of profiles)
    for (const plan of [-1, 0, 39])
      for (const addons of [[], ["invoices"], ["bank"], ["invoices", "bank"]]) {
        const expected = arranged
          .filter(
            (m) =>
              // Entrées portées par une licence (outils métier, commandes, cuisine, bar) : absentes sans licence.
              !["audience", "estimation", "orders", "kitchen", "bar"].includes(m.id) && !m.id.startsWith("tool-") &&
              (!paid[m.id] || addons.includes(paid[m.id])) &&
              (!m.permission ||
              ((plan >= 39 ||
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
  // Finance is included in the subscription: only an unsubscribed workspace proves the add-on grants nothing more.
  const accountant = workspaceNavigation
    .resolve({ roles: "ACCOUNTANT", plan: 0, addons: ["invoices"] })
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
    licenses: ["ops-orders"],
  });
  assert.equal(entries.some((entry) => entry.id === "dining"), false);
  assert.equal(entries.some((entry) => entry.id === "reservations"), false);
  assert.equal(entries.some((entry) => entry.id === "orders"), true);
});

test("outils métier : chaque outil installé a son entrée dans OPÉRATIONS, les autres sont absents", () => {
  const entries = (licenses: string[], modules?: string[]) =>
    workspaceNavigation.resolve({ roles: "WAITER", plan: 39, addons: [], licenses, modules });
  const ids = (licenses: string[], modules?: string[]) => entries(licenses, modules).map((entry) => entry.id);
  assert.equal(ids([]).some((id) => id.startsWith("tool-")), false);
  assert.deepEqual(ids(["site-planning", "trade-tools"]).filter((id) => id.startsWith("tool-")), ["tool-site-planning"]);
  // Chemin des modules (snapshot) : le module « outils métier » et la licence de l'outil.
  const viaModules = entries(["site-planning", "trade-tools"], ["trade-tools", "activity"]);
  assert.deepEqual(viaModules.filter((entry) => entry.id.startsWith("tool-")).map((entry) => [entry.id, entry.group]), [["tool-site-planning", "OPÉRATIONS"]]);
  // Commandes, cuisine et bar sont des modules gratuits : leur licence les fait apparaître.
  assert.equal(ids([]).includes("kitchen"), false);
  assert.equal(entries(["ops-kitchen"]).some((entry) => entry.id === "kitchen"), false); // permission « kitchen » absente pour WAITER
  assert.equal(workspaceNavigation.resolve({ roles: "OWNER", plan: 39, licenses: ["ops-kitchen"] }).some((entry) => entry.id === "kitchen"), true);
});
