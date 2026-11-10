import { WebsiteStudio } from "@/components/site-editor/entry";
import { demoEnabled } from "@/lib/database/db";
import { restaurantAdminContext } from "@/features/platform/admin-context";
import { notFound } from "next/navigation";
import "@/app/site-editor.css";
import "@/app/site-sections.css";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  const access = await restaurantAdminContext(restaurant).catch(() => null);
  if (!access) notFound();
  return (
    <WebsiteStudio
      restaurant={restaurant}
      restaurantName={access.restaurantName}
      industry={access.activity.industry}
      plan={access.plan}
      userRoles={access.roles}
      addons={access.addons}
      demo={demoEnabled()}
    />
  );
}
