import { createRegistry, type ModuleDefinition } from "./registry";

const lifecycle = {
  preservesData: true as const,
  suspension: "Manual review required; no runtime deactivation implemented.",
};

export const moduleDefinitions: readonly ModuleDefinition[] = [
  {
    id: "floor", version: 1, label: "Salle", scope: "establishment",
    required: [], optional: [], industries: ["restaurant"],
    capabilities: ["floor.view", "floor.arrange", "floor.status"], lifecycle,
  },
  {
    id: "table-booking", version: 1, label: "Réservation de tables", scope: "establishment",
    required: ["floor"], optional: [], industries: ["restaurant"],
    capabilities: ["table-booking.availability", "table-booking.request", "table-booking.manage"], lifecycle,
  },
];

export const moduleRegistry = createRegistry(moduleDefinitions);
