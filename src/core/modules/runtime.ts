import { moduleRegistry } from "./catalog";

export type ModuleRuntimeState = "enabled" | "suspended";
export type ModuleDecision = {
  id: string;
  available: boolean;
  reason: "available" | "not-entitled" | "suspended" | "dependency-unavailable";
};

/** Current restaurant offer: both existing modules are included from Basic. */
export function legacyRestaurantModules(plan: number): string[] {
  return plan === 39
    ? ["floor", "table-booking"]
    : [];
}

/** Pure resolution only. Callers must supply server-verified entitlements and states. */
export function resolveModuleRuntime(
  entitled: readonly string[],
  states: Readonly<Record<string, ModuleRuntimeState>>,
): ModuleDecision[] {
  const definitions = moduleRegistry.list();
  const known = new Set(definitions.map((definition) => definition.id));
  for (const id of [...entitled, ...Object.keys(states)]) {
    if (!known.has(id)) throw new Error(`Unknown module: ${id}`);
  }
  const entitledSet = new Set(entitled);
  const resolved = new Map<string, ModuleDecision>();
  const byId = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  function decide(id: string): ModuleDecision {
    const cached = resolved.get(id);
    if (cached) return cached;
    const definition = byId.get(id)!;
    let reason: ModuleDecision["reason"] = "available";
    if (!entitledSet.has(id)) reason = "not-entitled";
    else if (states[id] === "suspended") reason = "suspended";
    else if (
      definition.required.some((dependency) => !decide(dependency).available)
    )
      reason = "dependency-unavailable";
    const decision = { id, available: reason === "available", reason };
    resolved.set(id, decision);
    return decision;
  }
  return definitions.map((definition) => decide(definition.id));
}
