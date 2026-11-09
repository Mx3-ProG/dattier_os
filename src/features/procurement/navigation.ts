import type { NavigationContribution } from "@/core/navigation/registry";

/** Navigation for existing operations still implemented in lib/actions and Management. */
export const suppliersNavigation = {
  id: "suppliers",
  name: "Fournisseurs",
  group: "GESTION",
  icon: "Truck",
  permission: "purchases",
} satisfies NavigationContribution;

export const deliveriesNavigation = {
  id: "deliveries",
  name: "Livraisons",
  group: "GESTION",
  icon: "Package",
  permission: "purchases",
} satisfies NavigationContribution;
