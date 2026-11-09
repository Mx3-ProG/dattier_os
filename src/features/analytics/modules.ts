/**
 * Add-ons de la catégorie Tracking & Analytics. Tous lisent le même moteur de collecte :
 * un futur module ajoute sa vue, jamais son propre collecteur.
 * Registre descriptif : les droits réels restent vérifiés côté serveur.
 */
export const analyticsKind = "analytics";
export const analyticsCategoryId = "tracking-analytics";
export const earthTrackerProduct = "earth-tracker-3d";
export const analyticsRenderers = ["earth-tracker"] as const;
export const isAnalyticsRenderer = (value: unknown) =>
  (analyticsRenderers as readonly unknown[]).includes(value);

export type AnalyticsModule = {
  id: string;
  name: string;
  status: "available" | "planned";
  /** Données du moteur déjà disponibles, ou à ajouter avant d’ouvrir le module. */
  needs: readonly ("traffic" | "geo" | "pages" | "referrers" | "devices" | "conversions" | "clicks" | "timings")[];
};
export const analyticsModules: readonly AnalyticsModule[] = [
  { id: earthTrackerProduct, name: "Earth Tracker 3D", status: "available", needs: ["traffic", "geo", "pages"] },
  { id: "visitor-tracker", name: "Visitor Tracker", status: "planned", needs: ["traffic", "pages"] },
  { id: "traffic-sources", name: "Traffic Sources", status: "planned", needs: ["traffic", "referrers"] },
  { id: "live-visitors", name: "Live Visitors", status: "planned", needs: ["traffic"] },
  { id: "conversion-tracker", name: "Conversion Tracker", status: "planned", needs: ["traffic", "conversions"] },
  { id: "customer-journey", name: "Customer Journey", status: "planned", needs: ["pages"] },
  { id: "device-analytics", name: "Device Analytics", status: "planned", needs: ["devices"] },
  { id: "campaign-tracker", name: "Campaign Tracker", status: "planned", needs: ["referrers", "conversions"] },
  { id: "heatmap-tracker", name: "Heatmap Tracker", status: "planned", needs: ["clicks"] },
  { id: "performance-tracker", name: "Performance Tracker", status: "planned", needs: ["timings"] },
  { id: "geo-analytics", name: "Geo Analytics", status: "planned", needs: ["geo"] },
];
