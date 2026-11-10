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
  source: "free" | "purchase" | "demo";
  valid_until?: string | null;
};
export function hasCurrentLicense(license: Pick<StoreLicense, "status" | "valid_until"> | undefined, now = Date.now()) {
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
  demo?: boolean;
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
/** Counts distinct, installed rights across the historical and product catalogs. */
export function installedAddonCount(
  historicalIds: readonly string[],
  licenses: readonly Pick<StoreLicense, "product_id" | "status" | "valid_until">[],
  installations: readonly { addon_id: string; installed: boolean }[],
  now = Date.now(),
) {
  const installed = (id: string) => installations.find((entry) => entry.addon_id === id)?.installed !== false;
  const ids = new Set(historicalIds.filter(installed));
  for (const license of licenses)
    if (hasCurrentLicense(license, now) && installed(license.product_id)) ids.add(license.product_id);
  return ids.size;
}
/** Catégorie historique, définie dans le code : les fonctionnalités en abonnement. */
export const featuresCategoryId = "features";
export const pilotageCategoryId = "pilotage-tools";
export const pilotageMonthlyAddonIds = new Set(["prospect-scanner", "pipeline-crm", "customer-health"]);
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
    (filters.category === "all" || filters.category === featuresCategoryId || filters.category === pilotageCategoryId) &&
    filters.price !== "free" &&
    filters.acquisition !== "owned" &&
    filters.availability !== "unavailable"
  );
}
/** Counts reflect the other active filters, while the category chip is free to change. */
export function categoryCounts(
  products: readonly StoreProduct[],
  licenses: readonly StoreLicense[],
  filters: StoreFilters,
  monthlyShopCount: number,
  pilotageMonthlyShopCount = 0,
) {
  const withoutCategory = { ...filters, category: "all" };
  const visibleProducts = filterProducts(products, licenses, withoutCategory);
  const counts: Record<string, number> = {};
  for (const product of visibleProducts)
    counts[product.category_id] = (counts[product.category_id] ?? 0) + 1;
  const monthlyVisible = featuresVisible(withoutCategory);
  counts[featuresCategoryId] = monthlyVisible ? monthlyShopCount - pilotageMonthlyShopCount : 0;
  if (pilotageMonthlyShopCount > 0)
    counts[pilotageCategoryId] = (counts[pilotageCategoryId] ?? 0) + (monthlyVisible ? pilotageMonthlyShopCount : 0);
  counts.all = visibleProducts.length + (monthlyVisible ? monthlyShopCount : 0);
  return counts;
}
export function formatPrice(product: Pick<StoreProduct, "pricing_mode" | "price_cents">) {
  if (product.pricing_mode === "free") return "Gratuit";
  const amount = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: product.price_cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(product.price_cents / 100);
  return `${amount} € TTC`;
}
export const compatibilityLabels: Record<string, string> = {
  mobile: "Mobile",
  tablet: "Tablette",
  desktop: "Ordinateur",
};
