"use client";
import { SiteEditor } from "./index";
import { TenantSiteProvider } from "../cms-site/context";
import type { Role } from "@/lib/permissions";
import { RestaurantAdminShell } from "@/components/platform/restaurant-admin-shell";

export function WebsiteStudio({
  restaurant,
  restaurantName,
  plan,
  userRoles,
  addons,
  demo,
}: {
  restaurant: string;
  restaurantName: string;
  plan: number;
  userRoles: Role[];
  addons: string[];
  demo: boolean;
}) {
  const dashboard = `/dashboard?restaurant=${encodeURIComponent(restaurant)}`;
  return (
    <TenantSiteProvider restaurant={restaurant} demo={demo}>
      <RestaurantAdminShell
        restaurant={restaurant}
        restaurantName={restaurantName}
        plan={plan}
        userRoles={userRoles}
        addons={addons}
        activeModule="site"
        demo={demo}
      >
        <SiteEditor
          liveDataHref={(module) =>
            module === "menu"
              ? `${dashboard}&module=menu`
              : `/restaurant/${restaurant}?module=shop${module === "reviews" ? "#avis" : "#reglages-commande"}`
          }
        />
      </RestaurantAdminShell>
    </TenantSiteProvider>
  );
}
