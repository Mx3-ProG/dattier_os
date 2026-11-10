/** Presentation contributions only. Visibility never grants access to a module. */
export const pilotageWidgets = [
  {
    id: "receipts",
    label: "Encaissé aujourd’hui",
    kind: "metric",
    source: "payments",
  },
  {
    id: "orders",
    label: "Commandes en cours",
    kind: "metric",
    source: "orders",
  },
  { id: "tables", label: "Tables occupées", kind: "metric", source: "floor" },
  {
    id: "ready",
    label: "Préparations prêtes",
    kind: "metric",
    source: "kitchen",
  },
  {
    id: "sales",
    label: "Le rythme des ventes",
    kind: "panel",
    source: "payments",
  },
  { id: "goal", label: "Objectif du jour", kind: "panel", source: "payments" },
  {
    id: "service",
    label: "À la une du service",
    kind: "panel",
    source: "orders",
  },
  {
    id: "favorites",
    label: "Les favoris de la maison",
    kind: "panel",
    source: "orders",
  },
  { id: "qr", label: "QR codes", kind: "panel", source: "qr" },
  {
    id: "news",
    label: "Dernières nouvelles",
    kind: "panel",
    source: "activity",
  },
] as const;
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
