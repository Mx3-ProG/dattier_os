"use client";
import { SiteEditor } from "./index";
import { TenantSiteProvider } from "../cms-site/context";
import type { Role } from "@/core/permissions";
import { BusinessAdminShell } from "@/components/platform/restaurant-admin-shell";
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
    <TenantSiteProvider restaurant={restaurant} demo={demo} industry={industry}>
      <BusinessAdminShell
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
            module === "menu" || module.startsWith("tool-")
              ? `${dashboard}&module=${module}`
              : `/commerce/${restaurant}?module=shop${module === "reviews" ? "#avis" : "#reglages-commande"}`
          }
        />
      </BusinessAdminShell>
    </TenantSiteProvider>
  );
}
