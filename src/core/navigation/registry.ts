import { legacyMinimum, type Capability } from "@/core/modules/entitlements";
import { moduleForNavigation } from "@/core/modules/manifest";
import { can, type Permission, type Role } from "@/lib/permissions";
export type NavigationGroup =
  | "PILOTAGE"
  | "OPÉRATIONS"
  | "GESTION"
  | "ÉQUIPE"
  | "PILOTAGE FINANCIER"
  | "RELATION CLIENT"
  | "CONFIGURATION";
export type NavigationIcon =
  | "Package"
  | "LayoutDashboard"
  | "Activity"
  | "QrCode"
  | "UtensilsCrossed"
  | "ClipboardList"
  | "ChefHat"
  | "Wine"
  | "CalendarDays"
  | "BookOpen"
  | "Truck"
  | "Users"
  | "Clock"
  | "CalendarOff"
  | "Wallet"
  | "ClipboardCheck"
  | "FileSignature"
  | "FileText"
  | "Landmark"
  | "HandCoins"
  | "Banknote"
  | "Receipt"
  | "Heart"
  | "Settings"
  | "Globe"
  | "Earth"
  | "Calculator"
  | "ShieldCheck"
  | "Mail";
/** Presentation contract only. Server services remain the authorization boundary. */
export type NavigationContribution = {
  id: string;
  name: string;
  group: NavigationGroup;
  icon: NavigationIcon;
  permission: Permission | null;
  commercialCapability?: Capability;
  addon?: string;
  /** Add-on de la boutique : l’entrée n’apparaît qu’avec une licence active. */
  license?: string;
};
export type NavigationContext = {
  plan: number;
  roles: Role | readonly Role[];
  addons?: readonly string[];
  licenses?: readonly string[];
  uninstalledAddons?: readonly string[];
  activeModules?: { floor: boolean; "table-booking": boolean };
  /**
   * Modules disponibles selon `app.module_available` (lot P1-a2). Quand il est fourni,
   * il remplace à lui seul plan, add-ons, licences, installations et modules actifs :
   * une entrée est visible si son module est disponible et si le rôle le permet.
   */
  modules?: readonly string[];
};
export function createNavigation(
  contributions: readonly NavigationContribution[],
) {
  const entries = structuredClone(contributions);
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!/^[a-z][a-z0-9-]*$/.test(entry.id) || ids.has(entry.id))
      throw new Error(`Invalid or duplicate navigation id: ${entry.id}`);
    if (
      entry.commercialCapability !== undefined &&
      !Object.hasOwn(legacyMinimum, entry.commercialCapability)
    )
      throw new Error(`Unknown commercial capability: ${entry.id}`);
    ids.add(entry.id);
  }
  return {
    list: () => structuredClone(entries),
    resolve(context: NavigationContext) {
      const modules = context.modules;
      if (modules)
        return structuredClone(
          entries.filter((entry) => {
            const owner = moduleForNavigation(entry.id);
            // Une entrée sans module connu reste masquée : décision fermée par défaut.
            return !!owner && modules.includes(owner.id) &&
              (!entry.permission || can(context.roles, entry.permission));
          }),
        );
      return structuredClone(
        entries.filter(
          (entry) =>
            !context.uninstalledAddons?.includes(({ dining: "floor", reservations: "booking", site: "website", invoices: "invoices", attendance: "attendance", hr: "attendance", billing: "client-invoices", payroll: "payroll", qr: "qr", audience: "earth-tracker-3d" } as Record<string,string>)[entry.id] ?? "") &&
            (entry.id !== "dining" || context.activeModules?.floor !== false) &&
            (entry.id !== "reservations" ||
              context.activeModules?.["table-booking"] !== false) &&
            (!entry.license || context.licenses?.includes(entry.license)) &&
            (!entry.permission || can(context.roles, entry.permission)) &&
            (!entry.addon || context.addons?.includes(entry.addon)) &&
            (entry.commercialCapability === undefined ||
              context.plan >= legacyMinimum[entry.commercialCapability]),
        ),
      );
    },
  };
}
/** Keep existing links and role-specific landing pages, always within visible entries. */
export function currentNavigation<T extends { id: string }>(
  entries: readonly T[],
  requested: string,
  role?: Role,
): T | undefined {
  const preferred =
    role === "CHEF" ? "kitchen" : role === "BARTENDER" ? "bar" : "";
  return (
    entries.find((entry) => entry.id === requested) ||
    entries.find((entry) => entry.id === preferred) ||
    entries.find((entry) => entry.id !== "addons") ||
    entries[0]
  );
}
