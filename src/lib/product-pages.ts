export type ProductPageFields = {
  public_composition?: string;
  allergens?: string;
  seo_title?: string;
  seo_description?: string;
};

export function productPath(id: string) {
  return `/produits/${encodeURIComponent(id)}`;
}
