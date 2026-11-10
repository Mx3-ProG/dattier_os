import { notFound } from "next/navigation";
import { RestaurantHub } from "@/components/platform/restaurant-hub";
import { restaurantAdminContext } from "@/features/platform/admin-context";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  const access = await restaurantAdminContext(restaurant).catch(() => null);
  if (!access) notFound();
  return (
    <RestaurantHub
      restaurant={restaurant}
      restaurantName={access.restaurantName}
      activity={access.activity}
      plan={access.plan}
      userRoles={access.roles}
      addons={access.addons}
    />
  );
}
