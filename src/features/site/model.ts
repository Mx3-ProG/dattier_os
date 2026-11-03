export type SiteSection = {
  id: string;
  type: "text" | "image" | "catalog";
  title: string;
  body: string;
  visible: boolean;
  locked: boolean;
  asset?: string;
};
export type SiteDocument = {
  title: string;
  description: string;
  color: string;
  font?: "system" | "serif" | "sans";
  heroAsset?: string;
  sections?: SiteSection[];
  pages: { slug: string; title: string; text: string }[];
};
