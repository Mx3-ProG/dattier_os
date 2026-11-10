import { authenticated } from "@/features/platform/http";
import { restaurantPlan } from "@/features/platform/entitlements";
import { scope } from "@/lib/auth/session";
import type { Industry } from "@/features/onboarding/catalog";

export async function restaurantAdminContext(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    const scopedUser = await scope(db, user, restaurant);
    const result = await db.query<{ name: string; industry: Industry; trade: string; trade_detail: string }>(
      "SELECT name,industry,trade,trade_detail FROM restaurants WHERE id=$1",
      [restaurant],
    );
    return {
      restaurantName: result.rows[0]?.name ?? restaurant,
      activity: result.rows[0] ?? { industry: "restaurant" as const, trade: "Restaurant", trade_detail: "" },
      plan: await restaurantPlan(db, restaurant),
      roles: scopedUser.roles ?? [scopedUser.role],
      addons: (await db.query<{addon:string}>(
        "SELECT addon FROM unnest(ARRAY['loyalty','offline-conflicts','connections','domain']) AS addon WHERE app.addon_installed($1,addon)",
        [restaurant],
      )).rows.map(row=>row.addon),
    };
  });
}
