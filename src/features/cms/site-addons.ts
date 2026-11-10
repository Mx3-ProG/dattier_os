import type { LoadingRendererId } from "@/features/addons/loading-screens";
import { isSiteBackground, type SiteBackgroundId } from "./site-backgrounds";
import { themedVisuals, themedVisualIds } from "./themed-visuals";

/**
 * Add-ons visibles sur le site public. Pur : partagé par le serveur, l’éditeur
 * et le rendu du site. Une section d’add-on n’est proposée et affichée que si
 * l’add-on est installé dans l’établissement.
 */
export const addonSectionAddons = {
  estimation: "estimation-studio",
  loyalty: "loyalty",
  reservation: "booking",
  allergens: "menu-allergens",
  delivery: "shipping-rules",
  bundles: "product-bundles",
  services: "appointment-booking",
} as const;
export type AddonSectionType = keyof typeof addonSectionAddons;
export const isAddonSection = (type: string): type is AddonSectionType => Object.hasOwn(addonSectionAddons, type);
export const addonNames: Record<string, string> = {
  "estimation-studio": "Estimation",
  loyalty: "Fidélité",
  booking: "Réservations",
  "menu-allergens": "Allergènes avancés",
  "shipping-rules": "Livraison",
  "product-bundles": "Lots de produits",
  "appointment-booking": "Agenda de rendez-vous",
};

export type SiteAddonProduct = { id: string; renderer: string; name: string };
export type ShippingZone = { name: string; postcodes: string; mode: string; fee: number; freeAbove: number | null; delay: number | null };
export type PublicBundle = { name: string; price: number; items: { name: string; price: number }[] };
export type PublicService = { name: string; duration: number; price: number };
export type SiteAddonData = {
  installed: string[];
  loadingScreens: SiteAddonProduct[];
  decorations: SiteAddonProduct[];
  backgrounds: SiteAddonProduct[];
  notFoundPages: SiteAddonProduct[];
  shipping: ShippingZone[];
  bundles: PublicBundle[];
  services: PublicService[];
};
export const emptySiteAddons: SiteAddonData = { installed: [], loadingScreens: [], decorations: [], backgrounds: [], notFoundPages: [], shipping: [], bundles: [], services: [] };
export function parseSiteAddons(raw: unknown): SiteAddonData {
  if (!raw || typeof raw !== "object") return emptySiteAddons;
  const value = raw as Partial<SiteAddonData>;
  const list = <T,>(entry: unknown) => (Array.isArray(entry) ? (entry as T[]) : []);
  return {
    installed: list<string>(value.installed),
    loadingScreens: list<SiteAddonProduct>(value.loadingScreens),
    decorations: list<SiteAddonProduct>(value.decorations),
    backgrounds: list<SiteAddonProduct>(value.backgrounds),
    notFoundPages: list<SiteAddonProduct>(value.notFoundPages),
    shipping: list<ShippingZone>(value.shipping),
    bundles: list<PublicBundle>(value.bundles),
    services: list<PublicService>(value.services),
  };
}
export const sectionAvailable = (type: AddonSectionType, data: SiteAddonData) =>
  data.installed.includes(addonSectionAddons[type]);

/** Modèles de page 404. « plate » est le modèle par défaut, sans add-on. */
export const notFoundDesigns = {
  plate: { label: "Assiette vide", code: true },
  compass: { label: "Boussole perdue", code: true },
  neon: { label: "Néon 404", code: true },
  stars: { label: "Ciel étoilé", code: true },
  trail: { label: "Le chemin", code: true },
  portal: { label: "Le portail", code: true },
  lantern: { label: "La lanterne", code: true },
  map: { label: "La carte", code: true },
  balloon: { label: "Le ballon", code: true },
  snowglobe: { label: "Boule à neige", code: true },
  candy: { label: "Sucre d’orge", code: true },
  gingerbread: { label: "Maison en pain d’épices", code: true },
  gifts: { label: "Cadeaux perdus", code: true },
  aurora: { label: "Aurore de Noël", code: true },
  village: { label: "Village enneigé", code: true },
  forest: { label: "Forêt de sapins", code: true },
  advent: { label: "Calendrier de l’Avent", code: true },
  ...Object.fromEntries(Object.entries(themedVisuals).map(([id, visual]) => [id, { label: visual.label, code: true }])) as Record<keyof typeof themedVisuals, { label: string; code: true }>,
} as const;
export type NotFoundDesign = keyof typeof notFoundDesigns;
export const isNotFoundDesign = (value: unknown): value is NotFoundDesign =>
  typeof value === "string" && Object.hasOwn(notFoundDesigns, value);
export const notFoundDefaults = {
  title: "Cette page s’est fait la malle",
  message: "Le lien est peut-être ancien ou la page a été déplacée. Revenez à l’accueil, tout le reste est là.",
  button: "Retour à l’accueil",
};
/** Modèle effectif : un add-on choisi mais plus installé revient au modèle par défaut. */
export function effectiveNotFound(
  choice: { product: string | null } | undefined,
  owned: readonly SiteAddonProduct[],
): NotFoundDesign {
  const product = owned.find((entry) => entry.id === choice?.product);
  return product && isNotFoundDesign(product.renderer) ? product.renderer : "plate";
}
export function effectiveSiteLoader(
  choice: { product: string | null } | undefined,
  owned: readonly SiteAddonProduct[],
): LoadingRendererId | null {
  const product = owned.find((entry) => entry.id === choice?.product);
  return (product?.renderer as LoadingRendererId | undefined) ?? null;
}
export const siteDecorationIds = ["snowfall", "garland", "lights", ...themedVisualIds] as const;
export type SiteDecorationId = (typeof siteDecorationIds)[number];
export const isSiteDecoration = (value: unknown): value is SiteDecorationId =>
  typeof value === "string" && siteDecorationIds.some((id) => id === value);
export function effectiveSiteDecoration(
  choice: { product: string | null } | undefined,
  owned: readonly SiteAddonProduct[],
): SiteDecorationId | null {
  const product = owned.find((entry) => entry.id === choice?.product);
  return product && isSiteDecoration(product.renderer) ? product.renderer : null;
}
export function effectiveSiteBackground(
  choice: { product: string | null } | undefined,
  owned: readonly SiteAddonProduct[],
): SiteBackgroundId | null {
  const product = owned.find((entry) => entry.id === choice?.product);
  return product && isSiteBackground(product.renderer) ? product.renderer : null;
}
/** Clé de cache du site public : même établissement, même hôte, jamais un autre site. */
export function siteLoaderKey(host: string, pathname: string) {
  const match = /^\/r\/([^/]+)/.exec(pathname);
  return `studio-site-loader:v1:${host}:${match ? match[1] : ""}`;
}
export function postcodeZone(zones: readonly ShippingZone[], postcode: string) {
  const code = postcode.replace(/\s/g, "");
  if (!code) return null;
  return zones.find((zone) => zone.postcodes.split(",").map((prefix) => prefix.trim()).some((prefix) => prefix && code.startsWith(prefix))) ?? null;
}
