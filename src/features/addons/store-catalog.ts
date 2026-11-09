/** Règles d’affichage de la boutique. Les droits réels sont vérifiés côté serveur. */
export type StoreCategory = { id: string; name: string; description: string };
export type StoreProduct = {
  id: string;
  category_id: string;
  kind: string;
  renderer: string;
  name: string;
  description: string;
  pricing_mode: "free" | "one_time" | "subscription";
  price_cents: number;
  currency: string;
  sellable: boolean;
  listed: boolean;
  version: string;
  compatibility: string[];
};
export type StoreLicense = {
  product_id: string;
  status: "active" | "disputed" | "revoked";
  source: "free" | "purchase";
  valid_until?: string | null;
};
export function hasCurrentLicense(license: StoreLicense | undefined, now = Date.now()) {
  return license?.status === "active" && (!license.valid_until || Date.parse(license.valid_until) > now);
}
export type StorePendingPurchase = { product_id: string };
export type StoreSettings = {
  product_id: string | null;
  enabled: boolean;
  primary_color: string | null;
  secondary_color: string | null;
  speed: number;
  show_logo: boolean;
  message: string | null;
  revision: number;
};
export type StoreState = {
  categories: StoreCategory[];
  products: StoreProduct[];
  licenses: StoreLicense[];
  installations: { addon_id: string; installed: boolean }[];
  pending: StorePendingPurchase[];
  settings: StoreSettings | null;
  /** La mesure d’audience de cet établissement est-elle active ? */
  analyticsCollecting: boolean;
  canCustomize: boolean;
  canBuy: boolean;
  checkoutReady: boolean;
  logo: string | null;
};
/** Existing installations default to on, so migration never hides a working module. */
export function isInstalled(state: Pick<StoreState, "installations">, id: string) {
  return state.installations.find((entry) => entry.addon_id === id)?.installed !== false;
}
/** Catégorie historique, définie dans le code : les fonctionnalités en abonnement. */
export const featuresCategoryId = "features";
export type StoreFilters = {
  category: string;
  price: "all" | "free" | "paid";
  availability: "all" | "available" | "unavailable";
  acquisition: "all" | "owned" | "not-owned";
};
export const defaultStoreFilters: StoreFilters = {
  category: "all",
  price: "all",
  availability: "all",
  acquisition: "all",
};
export type ProductAction =
  | "active"
  | "activate"
  | "install"
  | "buy"
  | "resume"
  | "suspended"
  | "unavailable";
export function productAction(
  product: StoreProduct,
  license: StoreLicense | undefined,
  pending: boolean,
  activeProductId: string | null,
): ProductAction {
  if (hasCurrentLicense(license))
    return activeProductId === product.id ? "active" : "activate";
  if (license?.status === "disputed") return "suspended";
  if (!product.listed || !product.sellable) return "unavailable";
  if (product.pricing_mode === "free") return "install";
  if (product.pricing_mode !== "one_time") return "unavailable";
  return pending ? "resume" : "buy";
}
export function isOwned(license: StoreLicense | undefined) {
  return hasCurrentLicense(license) || license?.status === "disputed";
}
export function isAvailable(product: StoreProduct) {
  return (
    product.listed &&
    product.sellable &&
    (product.pricing_mode === "free" || product.pricing_mode === "one_time")
  );
}
export function filterProducts(
  products: readonly StoreProduct[],
  licenses: readonly StoreLicense[],
  filters: StoreFilters,
) {
  return products.filter((product) => {
    const owned = isOwned(licenses.find((license) => license.product_id === product.id));
    if (filters.category !== "all" && filters.category !== product.category_id) return false;
    if (filters.price === "free" && product.pricing_mode !== "free") return false;
    if (filters.price === "paid" && product.pricing_mode === "free") return false;
    if (filters.availability === "available" && !isAvailable(product)) return false;
    if (filters.availability === "unavailable" && isAvailable(product)) return false;
    if (filters.acquisition === "owned" && !owned) return false;
    if (filters.acquisition === "not-owned" && owned) return false;
    return true;
  });
}
/** Les fonctionnalités historiques sont payantes, en vente et jamais « possédées » dans cette vue. */
export function featuresVisible(filters: StoreFilters) {
  return (
    (filters.category === "all" || filters.category === featuresCategoryId) &&
    filters.price !== "free" &&
    filters.acquisition !== "owned" &&
    filters.availability !== "unavailable"
  );
}
export function formatPrice(product: Pick<StoreProduct, "pricing_mode" | "price_cents">) {
  if (product.pricing_mode === "free") return "Gratuit";
  const amount = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: product.price_cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(product.price_cents / 100);
  return `${amount} € HT`;
}
export const compatibilityLabels: Record<string, string> = {
  mobile: "Mobile",
  tablet: "Tablette",
  desktop: "Ordinateur",
};
