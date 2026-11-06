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
  demo,
}: {
  restaurant: string;
  restaurantName: string;
  plan: number;
  userRoles: Role[];
  demo: boolean;
}) {
  return (
    <TenantSiteProvider restaurant={restaurant} demo={demo}>
      <RestaurantAdminShell
        restaurant={restaurant}
        restaurantName={restaurantName}
        plan={plan}
        userRoles={userRoles}
        activeModule="site"
      >
        <div className="website-studio-content">
          <div className="studio-heading">
            <h1>Mon site web</h1>
            {demo && (
              <p>
                Démonstration locale · modifications propres à cet
                établissement.
              </p>
            )}
          </div>
          <SiteEditor
            liveDataHref={(module) =>
              module === "menu"
                ? `/dashboard?restaurant=${restaurant}&module=menu`
                : `/restaurant/${restaurant}?module=shop${module === "reviews" ? "#avis" : "#reglages-commande"}`
            }
          />
        </div>
      </RestaurantAdminShell>
    </TenantSiteProvider>
  );
}
