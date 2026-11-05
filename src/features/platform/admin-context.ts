import { authenticated } from "@/features/platform/http";
import { restaurantPlan } from "@/features/platform/entitlements";
import { scope } from "@/lib/auth/session";

export async function restaurantAdminContext(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    const scopedUser = await scope(db, user, restaurant);
    const result = await db.query<{ name: string }>(
      "SELECT name FROM restaurants WHERE id=$1",
      [restaurant],
    );
    return {
      restaurantName: result.rows[0]?.name ?? restaurant,
      plan: await restaurantPlan(db, restaurant),
      roles: scopedUser.roles ?? [scopedUser.role],
    };
  });
}
