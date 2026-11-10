import { SecurityCenter } from "@/components/security-center";
import "@/app/security.css";
import { RestaurantAdminShell } from "@/components/platform/restaurant-admin-shell";
import { restaurantAdminContext } from "@/features/platform/admin-context";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  const access = await restaurantAdminContext(restaurant).catch(() => null);
  if (!access) notFound();
  return (
    <RestaurantAdminShell
      restaurant={restaurant}
      restaurantName={access.restaurantName}
      industry={access.activity.industry}
      plan={access.plan}
      userRoles={access.roles}
      addons={access.addons}
      activeModule="security"
      pageTitle="Sécurité opérationnelle"
    >
      <SecurityCenter restaurant={restaurant} />
    </RestaurantAdminShell>
  );
}
