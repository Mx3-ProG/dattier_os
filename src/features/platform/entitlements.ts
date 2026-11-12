import { compareLegacyThreshold, compareLegacyCapability, legacyMinimum, type Capability } from "@/core/modules/entitlements";
import { demoEnabled, type DB } from "@/infrastructure/database/db";
import { saasReady } from "@/features/billing/stripe-saas";
import type { Plan } from "./pricing";

export async function restaurantPlan(
  db: DB,
  restaurant: string,
): Promise<Plan> {
  if (!demoEnabled() && saasReady()) {
    const card = await db.query<{ required: boolean }>(
      "SELECT app.restaurant_card_required($1) AS required", [restaurant],
    );
    if (card.rows[0]?.required) return 0;
  }
  const result = await db.query<{ plan: Plan | null }>(
    "SELECT app.restaurant_plan($1) AS plan",
    [restaurant],
  );
  return result.rows[0]?.plan ?? 0;
}

export async function requirePlan(db: DB, restaurant: string, minimum: Plan) {
  const plan = await restaurantPlan(db, restaurant);
  // Observation only: preserve the existing decision and disclose no tenant data.
  if (process.env.STUDIO_OS_ENTITLEMENTS_SHADOW === "true") {
    const comparison = compareLegacyThreshold(plan, minimum);
    if (comparison.comparable && !comparison.matches)
      console.warn("[studio-os] commercial entitlement mismatch", { plan, minimum });
  }
  if (plan < minimum)
    throw new Error("Accès non autorisé avec le forfait actuel.");
  return plan;
}

/** Named commercial gate, still enforcing historical rules. Does not bypass role or SQL checks. */
export async function requireCommercialCapability(db: DB, restaurant: string, capability: Capability) {
  // Validate before querying, so an unknown runtime value never grants access.
  if (!Object.hasOwn(legacyMinimum, capability)) throw new Error("Unknown commercial capability");
  const plan = await restaurantPlan(db, restaurant);
  const comparison = compareLegacyCapability(plan, capability);
  if (process.env.STUDIO_OS_ENTITLEMENTS_SHADOW === "true" && !comparison.matches)
    console.warn("[studio-os] commercial capability mismatch", { capability });
  if (capability === "loyalty") {
    await requirePaidAddon(db,restaurant,"loyalty");
    return plan;
  }
  if (!comparison.legacy) throw new Error("Accès non autorisé avec le forfait actuel.");
  const addon = capability === "website" || capability === "online-orders" ? capability : null;
  if (addon) {
    const { rows } = await db.query<{ installed: boolean }>(
      "SELECT app.addon_installed($1,$2) AS installed", [restaurant, addon],
    );
    if (!rows[0]?.installed) throw new Error("Cet add-on est désinstallé pour cet établissement.");
  }
  return plan;
}

/** Independent monthly feature right, scoped to the selected establishment. */
export async function requirePaidAddon(db: DB, restaurant: string, addon: string) {
  const { rows } = await db.query<{installed:boolean}>(
    "SELECT app.addon_installed($1,$2) AS installed",[restaurant,addon],
  );
  if (!rows[0]?.installed) throw new Error("Cet add-on n’est pas actif pour cet établissement.");
}
