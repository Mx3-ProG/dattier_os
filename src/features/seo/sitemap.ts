import type { SiteConfig } from "@/features/cms/schema";
import { pageUrl } from "./urls";

/** Sitemap protocol limit per file. */
export const SITEMAP_MAX_URLS = 50000;
export type SitemapEntry = { loc: string; lastmod?: string };

/** Public pages meant for search engines, whether or not site-wide indexing is on yet. */
export function publicPages(config: SiteConfig) {
  return Object.entries(config.pages)
    .filter(([, p]) => p.visible && p.kind !== "protected" && !p.seo.noIndex)
    .map(([key]) => key);
}
/** Pages a search engine may index: visible, public, not excluded by the owner. */
export function indexablePages(config: SiteConfig) {
  return config.seo.noIndex === false ? publicPages(config) : [];
}

export function sitemapEntries(input: {
  config: SiteConfig;
  canonicalBase: string;
  /** Publication date of the live version (ISO). */
  publishedAt: string | null;
}): SitemapEntry[] {
  const lastmod = input.publishedAt
    ? new Date(input.publishedAt).toISOString()
    : undefined;
  return indexablePages(input.config)
    .slice(0, SITEMAP_MAX_URLS)
    .map((key) => ({ loc: pageUrl(input.canonicalBase, key), lastmod }));
}

const xml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export function renderSitemapIndex(entries: SitemapEntry[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .slice(0, SITEMAP_MAX_URLS)
    .map(
      (e) =>
        `<sitemap><loc>${xml(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</sitemap>`,
    )
    .join("\n")}\n</sitemapindex>\n`;
}

export function renderSitemap(entries: SitemapEntry[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (e) =>
        `<url><loc>${xml(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n")}\n</urlset>\n`;
}
