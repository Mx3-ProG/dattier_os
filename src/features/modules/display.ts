import { moduleForNavigation, manifestFor, type ModuleId } from "@/core/modules/manifest";

/**
 * Affichage des modules dans le tableau de bord (migration 150, table `module_display`).
 * Pur : partagé par le serveur, la navigation et l'écran des add-ons.
 *
 * - `shown: true` : affiché même hors du secteur visé (le filtre de secteur est levé) ;
 * - `shown: false` : masqué du tableau de bord, le module reste installé et fonctionne ;
 * - aucune ligne : comportement par défaut.
 */
export type ModuleDisplay = { module_id: string; shown: boolean };

/** Même liste que `app.module_displayable` : jamais la configuration ni l'écran des add-ons. */
export const displayableModules = [
  "orders", "table-booking", "catalog", "stock", "trade-tools", "website", "floor", "kitchen", "bar",
  "recipes", "suppliers", "deliveries", "attendance", "payroll", "accounting", "expenses",
  "client-invoices", "invoices", "loyalty", "qr", "analytics", "estimation", "prospect-scanner",
  "pipeline-crm", "customer-health", "services", "products",
] as const satisfies readonly ModuleId[];
export type DisplayableModule = (typeof displayableModules)[number];
export const isDisplayableModule = (value: unknown): value is DisplayableModule =>
  typeof value === "string" && displayableModules.some((id) => id === value);

/** Modules réservés par défaut au secteur restauration : « Afficher » lève cette restriction. */
export const sectorGatedModules = new Set<string>([
  "floor", "table-booking", "orders", "catalog", "stock", "kitchen", "bar",
  "recipes", "suppliers", "deliveries", "qr",
]);

/** Add-on (catalogue mensuel ou boutique) → module du tableau de bord qu'il ouvre. */
const addonModules: Record<string, DisplayableModule> = {
  floor: "floor",
  booking: "table-booking",
  website: "website",
  loyalty: "loyalty",
  invoices: "invoices",
  attendance: "attendance",
  "client-invoices": "client-invoices",
  payroll: "payroll",
  qr: "qr",
  "prospect-scanner": "prospect-scanner",
  "pipeline-crm": "pipeline-crm",
  "customer-health": "customer-health",
  "earth-tracker-3d": "analytics",
  "estimation-studio": "estimation",
};
/** Module affichable d'un add-on ; les outils métier partagent l'entrée « Outils métier ». */
export function displayModuleForAddon(addon: string, kind?: string): DisplayableModule | null {
  if (kind === "business") return "trade-tools";
  return addonModules[addon] ?? null;
}

/** Entrées de navigation (écrans) portées par un module. */
export const moduleScreens = (module: DisplayableModule): readonly string[] =>
  manifestFor(module).navigation;

/**
 * Filtre de présentation appliqué après la décision commerciale (`modules`) :
 * secteur d'activité, puis choix d'affichage du commerce.
 */
export function dashboardEntries<T extends { id: string }>(
  entries: readonly T[],
  industry: string | undefined,
  restaurantOnly: ReadonlySet<string>,
  display: readonly ModuleDisplay[] = [],
): T[] {
  const choice = new Map(display.map((entry) => [entry.module_id, entry.shown]));
  return entries.filter((entry) => {
    const owner = moduleForNavigation(entry.id)?.id;
    const shown = owner ? choice.get(owner) : undefined;
    if (shown === false) return false;
    return industry === undefined || industry === "restaurant" || !restaurantOnly.has(entry.id) || shown === true;
  });
}
