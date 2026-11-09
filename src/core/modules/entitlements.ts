/** Commercial capabilities only. Server scope, role and business checks remain mandatory. */
export const capabilities = ["operations", "website", "loyalty", "finance", "online-orders"] as const;
export type Capability = (typeof capabilities)[number];
export type Offer = "inactive" | "basic" | "pro" | "premium";
const included: Record<Offer, readonly Capability[]> = {
  inactive: [],
  basic: ["operations"],
  pro: ["operations", "website", "loyalty", "finance"],
  premium: [...capabilities],
};
export type Grant = {
  organization: string;
  establishment?: string;
  capabilities: readonly Capability[];
  startsAt: number;
  endsAt: number;
};
export type EntitlementContext = {
  organization: string;
  establishment: string;
  active: boolean;
  offer: Offer;
  grants: readonly Grant[];
  now: number;
};

/** Server-supplied, already verified grants only; never accept this context from a browser. */
export function commercialRights(context: EntitlementContext): Capability[] {
  if (!context.active || !context.organization || !context.establishment || !Number.isFinite(context.now)) return [];
  const rights = new Set<Capability>(included[context.offer] ?? []);
  for (const grant of context.grants) {
    if (grant.organization !== context.organization ||
      (grant.establishment !== undefined && grant.establishment !== context.establishment) ||
      !Number.isFinite(grant.startsAt) || !Number.isFinite(grant.endsAt) ||
      context.now < grant.startsAt || context.now >= grant.endsAt) continue;
    for (const capability of grant.capabilities) {
      if (capabilities.includes(capability)) rights.add(capability);
    }
  }
  return capabilities.filter((capability) => rights.has(capability));
}

/** Transitional mapping: prices never enter the generic resolver. Unknown plans fail closed. */
export function legacyOffer(plan: number): Offer {
  return ({ 39: "basic", 69: "pro", 99: "premium" } as Record<number, Offer>)[plan] ?? "inactive";
}

/** Shadow comparison for the existing commercial threshold only, not effective user access. */
export function compareLegacyThreshold(plan: number, minimum: number) {
  const capability = ({ 39: "operations", 69: "website", 99: "online-orders" } as Record<number, Capability>)[minimum];
  if (!capability) return { comparable: false as const };
  const legacy = plan >= minimum;
  const proposed = included[legacyOffer(plan)].includes(capability);
  return { comparable: true as const, legacy, proposed, matches: legacy === proposed };
}

/** Compatibility bridge only; retire after persisted entitlements and SQL parity are validated. */
export const legacyMinimum: Readonly<Record<Capability, 39 | 69 | 99>> = Object.freeze({
  operations: 39, website: 69, loyalty: 69, finance: 69, "online-orders": 99,
});
export function compareLegacyCapability(plan: number, capability: Capability) {
  const minimum = legacyMinimum[capability];
  if (!Object.hasOwn(legacyMinimum, capability)) throw new Error("Unknown commercial capability");
  const legacy = plan >= minimum;
  const proposed = included[legacyOffer(plan)].includes(capability);
  return { legacy, proposed, matches: legacy === proposed };
}
