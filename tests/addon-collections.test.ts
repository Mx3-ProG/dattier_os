import test from "node:test";
import assert from "node:assert/strict";
import { addonCatalog, addonCollections } from "../src/features/addons/catalog";
const now = Date.parse("2026-11-08T12:00:00Z");
test("owned and shop partition the catalogue by the single subscription without duplicates", () => {
  for (const [plan, count] of [
    [0, 0],
    [39, 4],
  ]) {
    const { owned, shop } = addonCollections(plan, [], now);
    assert.equal(owned.length, count);
    assert.equal(owned.length + shop.length, addonCatalog.length);
    assert.equal(new Set([...owned, ...shop].map((x) => x.id)).size, addonCatalog.length);
  }
});
test("only a current active subscription belongs to owned; pending and expired remain in shop", () => {
  for (const [status, until, owned] of [
    ["active", "2026-12-08T12:00:00Z", true],
    ["active", "2026-11-08T12:00:00Z", false],
    ["active", null, false],
    ["active", "invalid", false],
    ["pending", null, false],
    ["cancelled", "2026-12-08T12:00:00Z", false],
  ] as const) {
    const result = addonCollections(
      39,
      [{ addon: "invoices", status, valid_until: until }],
      now,
    );
    assert.equal(
      result.owned.some((x) => x.id === "invoices"),
      owned,
    );
    assert.equal(
      result.shop.some((x) => x.id === "invoices"),
      !owned,
    );
  }
  const result = addonCollections(
    69,
    [
      {
        addon: "invoices",
        status: "active",
        valid_until: "2026-12-08T12:00:00Z",
      },
    ],
    now,
  );
  assert.equal(result.owned.filter((x) => x.id === "invoices").length, 1);
});

test("addon shortcuts require ownership and an accessible destination", async () => {
  const { addonDestination, addonDetails } =
    await import("../src/features/addons/catalog");
  assert.equal(addonDestination("floor", true, ["dining"]), "dining");
  assert.equal(addonDestination("invoices", true, ["invoices"]), "invoices");
  assert.equal(addonDestination("invoices", false, ["invoices"]), null);
  assert.equal(addonDestination("invoices", true, ["finance"]), null);
  assert.equal(addonDestination("website", true, ["site"]), "site");
  for (const id of ["unknown", "toString", "__proto__"])
    assert.equal(addonDestination(id, true, ["site"]), null);
  const { workspaceNavigation } =
    await import("../src/features/navigation/catalog");
  const ids = workspaceNavigation.list().map((entry) => entry.id);
  for (const detail of Object.values(addonDetails))
    assert.ok(ids.includes(detail.target));
});

test("scheduled cancellation preserves paid ownership until expiry, including when the plan also grants access", () => {
  const paid = {
    addon: "invoices",
    status: "active",
    valid_until: "2026-12-08T12:00:00Z",
    renewal_cancelled: true,
  };
  const card = addonCollections(39, [paid], now).owned.find(
    (addon) => addon.id === "invoices",
  )!;
  assert.equal(card.active, true);
  assert.equal(card.renewalCancelled, true);
  assert.equal(card.validUntil, paid.valid_until);
  assert.equal(
    addonCollections(39, [paid], Date.parse(paid.valid_until)).owned.some(
      (addon) => addon.id === "invoices",
    ),
    false,
  );
  const included = addonCollections(69, [paid], now, ["invoices"]).owned.find(
    (addon) => addon.id === "invoices",
  )!;
  assert.equal(included.included, true);
  assert.equal(included.renewalCancelled, true);
});
