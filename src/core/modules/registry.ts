import type { Industry } from "@/core/tenant/business";

/** Descriptive contracts only: never an authorization or billing decision. */
export type ModuleDefinition = {
  id: string;
  version: number;
  label: string;
  scope: "establishment" | "organization";
  required: readonly string[];
  optional: readonly string[];
  capabilities: readonly string[];
  /** Business sectors the module is designed for. Empty means every sector. */
  industries: readonly Industry[];
  lifecycle: { preservesData: true; suspension: string };
};

export function createRegistry(definitions: readonly ModuleDefinition[]) {
  const entries = new Map<string, ModuleDefinition>();
  for (const definition of definitions) {
    if (!/^[a-z][a-z0-9.-]*$/.test(definition.id) || entries.has(definition.id))
      throw new Error(`Invalid or duplicate module: ${definition.id}`);
    if (!Number.isInteger(definition.version) || definition.version < 1)
      throw new Error(`Invalid contract version: ${definition.id}`);
    entries.set(definition.id, structuredClone(definition));
  }
  for (const definition of entries.values()) {
    for (const dependency of [...definition.required, ...definition.optional]) {
      if (dependency === definition.id || !entries.has(dependency))
        throw new Error(`Invalid dependency: ${definition.id} -> ${dependency}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error(`Circular dependency: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const definition = entries.get(id)!;
    for (const dependency of [...definition.required, ...definition.optional]) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of entries.keys()) visit(id);
  return {
    list: () => structuredClone([...entries.values()]),
    /** Dependency-first configuration proposal, not an activation or purchase. */
    resolve(requested: readonly string[]) {
      const resolved = new Set<string>();
      function add(id: string) {
        const definition = entries.get(id);
        if (!definition) throw new Error(`Unknown module: ${id}`);
        if (resolved.has(id)) return;
        for (const dependency of definition.required) add(dependency);
        resolved.add(id);
      }
      requested.forEach(add);
      return [...resolved];
    },
    /** Required dependents must be reviewed before any suspension. */
    dependents(id: string, active: readonly string[]) {
      if (!entries.has(id)) throw new Error(`Unknown module: ${id}`);
      return active.filter((candidate) => candidate !== id && this.resolve([candidate]).includes(id));
    },
  };
}
