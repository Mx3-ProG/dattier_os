import { type DB, rows } from "../../infrastructure/database/db";
import { saasReady } from "@/features/billing/stripe-saas";
import type { Snapshot, MenuItem } from "../../shared/types";

export async function menu(
  db: DB,
  r: string,
  financial = false,
  includeArchived = false,
) {
  return rows<MenuItem>(
    db,
    `SELECT m.*,coalesce((SELECT min(floor(coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=ri.ingredient_id AND l.expires_on>=CURRENT_DATE),0)/ri.quantity)) FROM recipe_ingredients ri WHERE ri.menu_id=m.id),0)::int AS portions ${financial ? ",(SELECT sum(ri.quantity*i.cost)::float FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE ri.menu_id=m.id) AS cost" : ""} FROM menu_items m WHERE m.restaurant_id=$1 ${includeArchived ? "" : "AND m.archived_at IS NULL"} ORDER BY m.category,m.name`,
    [r],
  );
}

/** Trial and subscription state of the open establishment's organization. */
export async function trialStatus(db: DB, r: string): Promise<Snapshot["trial"]> {
  try {
    const row = (
      await rows<{
        organization: string;
        owner: boolean | null;
        active: boolean | null;
        ends_at: string | null;
        status: string | null;
      }>(
        db,
        `SELECT r.organization_id AS organization,b.owner,t.trial_active AS active,t.trial_ends_at AS ends_at,b.status
         FROM restaurants r
         LEFT JOIN LATERAL app.organization_trial(r.organization_id) t ON true
         LEFT JOIN LATERAL app.plan_billing_context(r.organization_id) b ON true
         WHERE r.id=$1`,
        [r],
      )
    )[0];
    if (!row) return null;
    return {
      organization: row.organization,
      owner: Boolean(row.owner),
      active: Boolean(row.active),
      endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
      subscribed: ["active", "trialing", "past_due"].includes(row.status || ""),
      billingReady: saasReady(),
    };
  } catch {
    // The reminder is optional: never block the workspace on it.
    return null;
  }
}
