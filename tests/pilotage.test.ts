import test from "node:test";
import assert from "node:assert/strict";
import {
  pilotageWidgets,
  pilotagePreferenceKey,
  hiddenPilotageWidgets,
  encodePilotagePreferences,
} from "../src/features/pilotage/catalog";

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
  assert.equal(pilotageWidgets.length, 10);
  assert.equal(new Set(pilotageWidgets.map((w) => w.id)).size, 10);
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
