import type { SiteConfig } from "@/features/cms/schema";

/** Internal request header naming the restaurant site being rendered (set by src/proxy.ts only). */
export const SITE_HEADER = "x-atacuisine-site";
export const DEFAULT_LOCALE = { language: "fr", country: "FR" } as const;
const LANGUAGE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** Language and country of a site; legacy sites (no setting) stay French / France. */
export function siteLocale(config: Pick<SiteConfig, "seo">) {
  const language = config.seo.locale?.language || DEFAULT_LOCALE.language;
  const country =
    config.seo.locale?.country ??
    (config.seo.locale ? "" : DEFAULT_LOCALE.country);
  const base = language.split("-")[0];
  const region = language.split("-")[1] || country;
  return {
    /** Value of <html lang> and JSON-LD inLanguage. */
    language,
    country,
    /** Open Graph locale (ll_CC), only when a territory is known. */
    ogLocale: region ? `${base}_${region}` : undefined,
  };
}
/** Validates a language value read outside the schema (e.g. raw SQL). */
export const safeLanguage = (value: unknown) =>
  typeof value === "string" && LANGUAGE.test(value) ? value : DEFAULT_LOCALE.language;

/** Redirect configured for a requested path (single hop, never to itself). */
export function findRedirect(config: Pick<SiteConfig, "seo">, path: string) {
  const normalized = "/" + path.replace(/^\/+|\/+$/g, "");
  return (
    config.seo.redirects?.find(
      (r) => r.from.replace(/\/+$/, "") === normalized && r.to !== normalized,
    ) ?? null
  );
}
