/**
 * Canonical URLs of a restaurant site.
 *
 * The canonical host comes from the database (primary verified domain), never
 * from the request `Host` header: a site served both on the platform
 * (`/r/{id}`) and on its own domain must declare a single canonical address.
 */
export type SiteUrlInput = {
  restaurant: string;
  /** Platform origin (APP_URL), e.g. https://app.dattier.fr */
  platformUrl: string;
  /** Primary verified hostname from `app.primary_domain()`, or null. */
  primaryHost: string | null;
  /** Hostname that served the current request. */
  requestHost: string;
  demo?: boolean;
};
export type SiteUrls = {
  /** Absolute base of the canonical site, without trailing slash. */
  canonicalBase: string;
  /** Absolute base of the site as served on this request (for relative links). */
  servedBase: string;
  /** True when this request is not on the canonical host (platform mirror of a custom domain). */
  mirror: boolean;
};
const hostOf = (value: string) => {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname
      .toLowerCase();
  } catch {
    return "";
  }
};
export function siteUrls(input: SiteUrlInput): SiteUrls {
  const platform = new URL(input.platformUrl);
  const platformBase = `${platform.origin}/r/${encodeURIComponent(input.restaurant)}`;
  const requestHost = hostOf(input.requestHost);
  if (input.demo || !input.primaryHost)
    return {
      canonicalBase: platformBase,
      servedBase: platformBase,
      mirror: false,
    };
  const primary = hostOf(input.primaryHost);
  const domainBase = `${platform.protocol}//${primary}`;
  const onPlatform = requestHost === platform.hostname.toLowerCase();
  return {
    canonicalBase: domainBase,
    servedBase: onPlatform ? platformBase : `${platform.protocol}//${requestHost}`,
    mirror: requestHost !== primary,
  };
}
/** Absolute URL of a page key on a base ("home" → base root). */
export function pageUrl(base: string, key: string) {
  return key === "home" || key === "" ? `${base}/` : `${base}/${encodeURIComponent(key)}`;
}
/** Absolute URL for a media path (`/cms/…`, `/api/cms/…`) or an absolute http(s) URL. */
export function absoluteMedia(origin: string, src: string) {
  if (!src) return "";
  if (/^https?:\/\//.test(src)) return src;
  return src.startsWith("/") ? new URL(src, origin).href : "";
}
