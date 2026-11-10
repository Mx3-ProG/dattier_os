/** Commercial capabilities only. Server scope, role and business checks remain mandatory. */
export const capabilities = ["operations", "website", "loyalty", "finance", "online-orders"] as const;
export type Capability = (typeof capabilities)[number];
export type Offer = "inactive" | "studio";
// Loyalty is a paid add-on: the subscription never grants it on its own.
const included: Record<Offer, readonly Capability[]> = {
  inactive: [],
  studio: ["operations", "website", "finance", "online-orders"],
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

/** Prices never enter the generic resolver. Unknown plans fail closed. */
export function legacyOffer(plan: number): Offer {
  return plan === 39 ? "studio" : "inactive";
}

/** Shadow comparison for the existing commercial threshold only, not effective user access. */
export function compareLegacyThreshold(plan: number, minimum: number) {
  if (minimum !== 39) return { comparable: false as const };
  const legacy = plan >= minimum;
  const proposed = included[legacyOffer(plan)].includes("operations");
  return { comparable: true as const, legacy, proposed, matches: legacy === proposed };
}

/** Every plan-based capability requires the single subscription; loyalty also needs its add-on. */
export const legacyMinimum: Readonly<Record<Capability, 39>> = Object.freeze({
  operations: 39, website: 39, loyalty: 39, finance: 39, "online-orders": 39,
});
export function compareLegacyCapability(plan: number, capability: Capability) {
  if (!Object.hasOwn(legacyMinimum, capability)) throw new Error("Unknown commercial capability");
  const legacy = plan >= legacyMinimum[capability];
  const proposed = capability === "loyalty" ? legacy : included[legacyOffer(plan)].includes(capability);
  return { legacy, proposed, matches: legacy === proposed };
}
