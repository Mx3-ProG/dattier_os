import { can, type Permission, type Role } from "@/core/permissions";

export type RestaurantModuleId =
  | "team"
  | "shop"
  | "loyalty"
  | "site"
  | "domains"
  | "seo"
  | "inventory"
  | "security"
  | "reconciliation"
  | "integrations";

export type RestaurantModule = {
  id: RestaurantModuleId;
  label: string;
  permissions: Permission[];
  minimumPlan?: number;
};

export const restaurantModules: RestaurantModule[] = [
  { id: "team", label: "Équipe", permissions: ["team"] },
  { id: "shop", label: "Boutique et avis", permissions: ["orders"] },
  {
    id: "loyalty",
    label: "Fidélité",
    permissions: ["customers"],
    minimumPlan: 39,
  },
  {
    id: "site",
    label: "Mon site",
    permissions: ["catalog"],
    minimumPlan: 39,
  },
  {
    id: "domains",
    label: "Domaines",
    permissions: ["catalog"],
    minimumPlan: 39,
  },
  {
    id: "seo",
    label: "SEO et visibilité IA",
    permissions: ["website"],
    minimumPlan: 39,
  },
  {
    id: "inventory",
    label: "Stocks et achats",
    permissions: ["stock", "purchases"],
  },
  { id: "security", label: "Sécurité", permissions: ["security"] },
  {
    id: "reconciliation",
    label: "Conflits hors ligne",
    permissions: ["audit"],
  },
  { id: "integrations", label: "Connexions", permissions: ["settings"] },
];

export function availableRestaurantModules(
  roles: Role[],
  plan: number,
  addons: readonly string[] = [],
): RestaurantModule[] {
  return restaurantModules.filter(
    (module) =>
      (module.id === "loyalty" ? addons.includes("loyalty") :
       module.id === "reconciliation" ? addons.includes("offline-conflicts") :
       module.id === "integrations" ? addons.includes("connections") :
       module.id === "domains" ? plan >= 39 && addons.includes("domain") :
       plan >= (module.minimumPlan ?? 0)) &&
      module.permissions.some((permission) => can(roles, permission)),
  );
}

export function restaurantModuleHref(
  restaurant: string,
  module: RestaurantModuleId,
) {
  const base = `/restaurant/${encodeURIComponent(restaurant)}`;
  if (["site", "security", "seo"].includes(module))
    return `${base}/${module}`;
  return `${base}?module=${module}`;
}
