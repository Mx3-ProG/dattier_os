import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry, type ModuleDefinition } from "../src/core/modules/registry";
import { moduleRegistry } from "../src/core/modules/catalog";
const definition = (id: string, required: string[] = [], optional: string[] = []): ModuleDefinition => ({
  id, version: 1, label: id, required, optional, scope: "establishment",
  capabilities: [], industries: [], lifecycle: { preservesData: true, suspension: "Review" },
});
test("registry rejects missing dependencies, duplicates and cycles", () => {
  assert.throws(() => createRegistry([definition("a", ["missing"])]));
  assert.throws(() => createRegistry([definition("a"), definition("a")]));
  assert.throws(() => createRegistry([definition("a", ["b"]), definition("b", [], ["a"])]));
  assert.throws(() => moduleRegistry.resolve(["unknown"]));
});
test("required dependencies are included once; optional dependencies are not purchased", () => {
  const registry = createRegistry([definition("a", ["b"], ["c"]), definition("b"), definition("c")]);
  assert.deepEqual(registry.resolve(["a", "b"]), ["b", "a"]);
  assert.deepEqual(registry.dependents("b", ["a", "b", "c"]), ["a"]);
});
test("bookings no longer require the floor plan; consumers cannot mutate registry", () => {
  // Depuis la migration 100 : le plan de salle enrichit les réservations sans être requis.
  assert.deepEqual(moduleRegistry.resolve(["table-booking"]), ["table-booking"]);
  assert.deepEqual(moduleRegistry.dependents("floor", ["floor", "table-booking"]), []);
  const snapshot = moduleRegistry.list();
  snapshot[0].label = "changed";
  assert.equal(moduleRegistry.list()[0].label, "Salle");
});
