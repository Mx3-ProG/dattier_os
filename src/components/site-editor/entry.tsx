"use client";
import { SiteEditor } from "./index";
import { TenantSiteProvider } from "../cms-site/context";
import type { Role } from "@/lib/permissions";
import { RestaurantAdminShell } from "@/components/platform/restaurant-admin-shell";
import type { Industry } from "@/features/onboarding/catalog";

export function WebsiteStudio({
  restaurant,
  restaurantName,
  industry = "restaurant",
  plan,
  userRoles,
  addons,
  demo,
}: {
  restaurant: string;
  restaurantName: string;
  industry?: Industry;
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
        industry={industry}
        plan={plan}
        userRoles={userRoles}
        addons={addons}
        activeModule="site"
        demo={demo}
      >
        <SiteEditor
          liveDataHref={(module) =>
            industry !== "restaurant" ? dashboard + "&module=trade-tools" : module === "menu"
              ? `${dashboard}&module=menu`
              : `/restaurant/${restaurant}?module=shop${module === "reviews" ? "#avis" : "#reglages-commande"}`
          }
        />
      </RestaurantAdminShell>
    </TenantSiteProvider>
  );
}
