import { authenticated } from "@/features/platform/http";
import { restaurantPlan } from "@/features/platform/entitlements";
import { notFound } from "next/navigation";
import { RestaurantHub } from "@/components/platform/restaurant-hub";
import type { Role } from "@/lib/permissions";
import { scope } from "@/lib/auth/session";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  const access = await authenticated(restaurant, async (db, user) => ({
    plan: await restaurantPlan(db, restaurant),
    roles: (await scope(db, user, restaurant)).roles ?? [user.role],
  })).catch(() => null);
  if (!access) notFound();
  return (
    <RestaurantHub
      restaurant={restaurant}
      plan={access.plan}
      userRoles={access.roles as Role[]}
    />
  );
}
