import test from "node:test";
import assert from "node:assert/strict";
import {
  pilotageWidgets,
  pilotagePreferenceKey,
  hiddenPilotageWidgets,
  encodePilotagePreferences,
  availablePilotageWidgets,
  defaultHiddenPilotageWidgets,
  type PilotageSource,
} from "../src/features/pilotage/catalog";
import { readFile } from "node:fs/promises";

test("pilotage preserves every existing block by default and on invalid preferences", () => {
  for (const raw of [
    null,
    "{",
    "null",
    "[]",
    '{"version":2,"hidden":["sales"]}',
    '{"version":1,"hidden":null}',
  ]) {
    assert.deepEqual(hiddenPilotageWidgets(raw), []);
  }
  assert.equal(new Set(pilotageWidgets.map((w) => w.id)).size, pilotageWidgets.length);
});
test("pilotage accepts only registered ids, deduplicates and supports reset", () => {
  assert.deepEqual(
    hiddenPilotageWidgets(
      '{"version":1,"hidden":["sales","sales","unknown",null,{},"tables"]}',
    ),
    ["sales", "tables"],
  );
  assert.deepEqual(
    hiddenPilotageWidgets(encodePilotagePreferences(["sales", "qr"])),
    ["sales", "qr"],
  );
  assert.deepEqual(hiddenPilotageWidgets(encodePilotagePreferences([])), []);
});
test("pilotage storage is isolated by establishment and person without delimiter collisions", () => {
  const keys = [
    pilotagePreferenceKey("one", "alice"),
    pilotagePreferenceKey("two", "alice"),
    pilotagePreferenceKey("one", "bob"),
    pilotagePreferenceKey("a:b", "c"),
    pilotagePreferenceKey("a", "b:c"),
  ];
  assert.equal(new Set(keys).size, keys.length);
});

test("every business family gets an overview with its own default blocks", () => {
  const all = new Set<PilotageSource>(pilotageWidgets.map((w) => w.source));
  const shown = (industry: Parameters<typeof defaultHiddenPilotageWidgets>[0]) => {
    const hidden = new Set(defaultHiddenPilotageWidgets(industry, all));
    return availablePilotageWidgets(all).filter((w) => !hidden.has(w.id)).map((w) => w.id);
  };
  for (const industry of ["restaurant", "beauty", "retail", "construction", "services", "other"] as const)
    assert.ok(shown(industry).includes("receipts"), industry);
  assert.ok(shown("restaurant").includes("tables"));
  assert.ok(!shown("construction").includes("tables"));
  assert.ok(shown("construction").includes("sites"));
  assert.ok(shown("beauty").includes("appointments"));
  assert.ok(shown("retail").includes("followups"));
  // Sans outil métier installé, le bloc n'est pas proposé du tout.
  const bare = new Set<PilotageSource>(["payments", "activity", "qr"]);
  assert.ok(!availablePilotageWidgets(bare).some((w) => w.id === "sites"));
});
test("the database accepts every registered block id", async () => {
  const sql = await readFile("database/migrations/140_operations_modules.sql", "utf8");
  for (const widget of pilotageWidgets) assert.ok(sql.includes(`'${widget.id}'`), widget.id);
});
