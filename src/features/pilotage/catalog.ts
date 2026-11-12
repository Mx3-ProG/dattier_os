import type { Industry } from "@/core/tenant/business";

/**
 * Blocs de la vue d'ensemble. Présentation uniquement : afficher un bloc
 * n'ouvre jamais l'accès à un module.
 *
 * - `source` : donnée lue. Un bloc dont la source manque à l'établissement
 *   (module absent, outil métier non installé) n'est pas proposé.
 * - `industries` : métiers pour lesquels le bloc est affiché d'office ;
 *   "all" pour tous. Les autres peuvent l'activer dans « Personnaliser ».
 */
export type PilotageSource =
  | "payments" | "orders" | "floor" | "kitchen" | "qr" | "activity"
  | "stock" | "reservations" | "customers" | "team"
  | "agenda" | "sites" | "quotes" | "reports" | "equipment" | "salon-stock" | "followups";
type Widget = {
  id: string;
  label: string;
  kind: "metric" | "panel";
  source: PilotageSource;
  industries: "all" | readonly Industry[];
};
export const pilotageWidgets = [
  // Communs à tous les métiers
  { id: "receipts", label: "Encaissé aujourd’hui", kind: "metric", source: "payments", industries: "all" },
  { id: "orders", label: "Commandes en cours", kind: "metric", source: "orders", industries: "all" },
  { id: "preparing", label: "Commandes en préparation", kind: "metric", source: "orders", industries: "all" },
  { id: "sales", label: "Le rythme des ventes", kind: "panel", source: "payments", industries: "all" },
  { id: "goal", label: "Objectif du jour", kind: "panel", source: "payments", industries: "all" },
  { id: "service", label: "À la une du service", kind: "panel", source: "orders", industries: "all" },
  { id: "favorites", label: "Les meilleures ventes", kind: "panel", source: "orders", industries: "all" },
  { id: "qr", label: "QR codes", kind: "panel", source: "qr", industries: "all" },
  { id: "news", label: "Dernières nouvelles", kind: "panel", source: "activity", industries: "all" },
  { id: "stock", label: "Stocks à surveiller", kind: "metric", source: "stock", industries: ["restaurant", "retail"] },
  { id: "customers", label: "Clients fidèles", kind: "metric", source: "customers", industries: ["beauty", "services", "other"] },
  { id: "team", label: "Équipe planifiée aujourd’hui", kind: "metric", source: "team", industries: ["services", "construction"] },
  // Restauration (salle, cuisine, réservations)
  { id: "tables", label: "Tables occupées", kind: "metric", source: "floor", industries: ["restaurant"] },
  { id: "ready", label: "Préparations prêtes", kind: "metric", source: "kitchen", industries: ["restaurant"] },
  { id: "reservations", label: "Réservations du jour", kind: "metric", source: "reservations", industries: ["restaurant"] },
  // Beauté (outils métier « Agenda de rendez-vous » et « Stocks salon »)
  { id: "appointments", label: "Rendez-vous aujourd’hui", kind: "metric", source: "agenda", industries: "all" },
  { id: "agenda", label: "Prochains rendez-vous", kind: "panel", source: "agenda", industries: "all" },
  { id: "salon-stock", label: "Produits sous le seuil", kind: "metric", source: "salon-stock", industries: ["beauty"] },
  // BTP (outils métier chantiers, devis, rapports, matériel)
  { id: "sites", label: "Chantiers en cours", kind: "metric", source: "sites", industries: ["construction"] },
  { id: "quotes", label: "Devis en attente de réponse", kind: "metric", source: "quotes", industries: "all" },
  { id: "reserves", label: "Réserves à lever", kind: "metric", source: "reports", industries: ["construction"] },
  { id: "equipment", label: "Matériel à entretenir", kind: "metric", source: "equipment", industries: ["construction"] },
  // Commerce (outil métier « Paniers abandonnés »)
  { id: "followups", label: "Relances paniers (7 jours)", kind: "metric", source: "followups", industries: ["retail"] },
] as const satisfies readonly Widget[];
export type PilotageWidgetId = (typeof pilotageWidgets)[number]["id"];
const known = new Set<string>(pilotageWidgets.map((w) => w.id));
export function pilotagePreferenceKey(restaurant: string, user: string) {
  return `studio-os:pilotage:v1:${encodeURIComponent(restaurant)}:${encodeURIComponent(user)}`;
}
/** Unknown or malformed preferences fail back to the complete existing dashboard. */
export function hiddenPilotageWidgets(raw: string | null): PilotageWidgetId[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("hidden" in value) ||
      !Array.isArray(value.hidden)
    )
      return [];
    return [
      ...new Set(
        value.hidden.filter(
          (id): id is PilotageWidgetId =>
            typeof id === "string" && known.has(id),
        ),
      ),
    ];
  } catch {
    return [];
  }
}
export function encodePilotagePreferences(hidden: readonly PilotageWidgetId[]) {
  return JSON.stringify({
    version: 1,
    hidden: [...new Set(hidden)].filter((id) => known.has(id)),
  });
}

/** Blocs proposés à cet établissement : ceux dont la donnée existe. */
export function availablePilotageWidgets(sources: ReadonlySet<PilotageSource>) {
  return pilotageWidgets.filter((widget) => sources.has(widget.source));
}
/** Blocs masqués d'office : disponibles mais non conseillés pour ce métier. */
export function defaultHiddenPilotageWidgets(
  industry: Industry | undefined,
  sources: ReadonlySet<PilotageSource>,
): PilotageWidgetId[] {
  const kind = industry ?? "restaurant";
  return availablePilotageWidgets(sources)
    .filter((widget) => widget.industries !== "all" && !(widget.industries as readonly Industry[]).includes(kind))
    .map((widget) => widget.id);
}
