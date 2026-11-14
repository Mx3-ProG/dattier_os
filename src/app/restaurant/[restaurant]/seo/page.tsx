import { SeoDashboard } from "@/components/platform/seo-dashboard";
import { BusinessAdminShell } from "@/components/platform/restaurant-admin-shell";
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
    <BusinessAdminShell
      restaurant={restaurant}
      restaurantName={access.restaurantName}
      industry={access.activity.industry}
      plan={access.plan}
      userRoles={access.roles}
      addons={access.addons}
      activeModule="seo"
      pageTitle="SEO et visibilité IA"
      contentClassName="platform"
    >
      <SeoDashboard restaurant={restaurant} />
    </BusinessAdminShell>
  );
}
