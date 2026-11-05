import type { DB } from "@/lib/database/db";
import type { Plan } from "./pricing";

export async function restaurantPlan(
  db: DB,
  restaurant: string,
): Promise<Plan> {
  const result = await db.query<{ plan: Plan | null }>(
    "SELECT app.restaurant_plan($1) AS plan",
    [restaurant],
  );
  return result.rows[0]?.plan ?? 0;
}

export async function requirePlan(db: DB, restaurant: string, minimum: Plan) {
  const plan = await restaurantPlan(db, restaurant);
  if (plan < minimum)
    throw new Error("Accès non autorisé avec le forfait actuel.");
  return plan;
}
