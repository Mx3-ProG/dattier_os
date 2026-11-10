import { createHash } from "node:crypto";

/** Étapes pures de la collecte, sans base de données ni réseau. */
const BOT =
  /bot\b|bot[/;-]|crawl|spider|slurp|scrape|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|curl|wget|python-|axios|node-fetch|go-http|java\/|okhttp|libwww|httpclient|phantom|puppeteer|playwright|selenium|chatgpt|gptbot|claude|perplexity|bytespider|ahrefs|semrush|mj12|dotbot/i;
/** Robots déclarés et outils techniques. Un robot qui imite un navigateur peut passer : c’est une estimation. */
export function isAutomated(userAgent: string | null) {
  if (!userAgent || userAgent.length < 20 || !/^Mozilla\//.test(userAgent)) return true;
  return BOT.test(userAgent);
}
type HeaderReader = { get(name: string): string | null };
export function isPrefetch(headers: HeaderReader) {
  return /prefetch|prerender/i.test(
    `${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""} ${headers.get("x-moz") ?? ""}`,
  );
}
export const refusalSignal = (headers: HeaderReader) =>
  headers.get("sec-gpc") === "1" || headers.get("dnt") === "1";

/** Pages personnelles : on garde la rubrique, jamais la suite de l’adresse. */
const PRIVATE = new Set(["compte", "account", "checkout", "panier", "suivi", "commande", "reservation-confirmee"]);
const TECHNICAL = /^\/(?:api|_next|platform|dashboard|restaurant|auth|connexion|q|demo|cms|fonts|media)(?:\/|$)/;
/**
 * Adresse de page mesurable, sans paramètres ni fragment. `null` : à écarter.
 * Le préfixe /r/<établissement> du domaine de la plateforme est retiré : une même page garde un seul nom.
 */
export function normalizePath(raw: unknown, restaurant: string | null): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.length > 400) return null;
  let path = raw.split(/[?#]/, 1)[0];
  try {
    path = decodeURI(path);
  } catch {
    return null;
  }
  if (restaurant) {
    const prefix = `/r/${restaurant}`;
    if (path === prefix) path = "/";
    else if (path.startsWith(`${prefix}/`)) path = path.slice(prefix.length);
    else return null;
  }
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (TECHNICAL.test(path) || /\.[a-z0-9]{1,8}$/i.test(path)) return null;
  if (!/^\/[\p{L}\p{N}/_.~-]*$/u.test(path) || path.length > 160 || path.includes("..")) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.length > 4) return null;
  if (segments[0] && PRIVATE.has(segments[0].toLowerCase())) return `/${segments[0].toLowerCase()}`;
  return path;
}

export type SiteIdentity = { restaurant: string; site: string; platform: boolean };
/**
 * L’établissement vient toujours du contexte serveur : le domaine vérifié, ou sur l’adresse de
 * la plateforme le chemin /r/<id> de la page. Le corps de la requête ne le transporte jamais.
 * L’origine doit correspondre à l’hôte : un autre site ne peut pas alimenter ces statistiques.
 */
export async function resolveSite(input: {
  host: string;
  origin: string | null;
  platformHosts: readonly string[];
  path: unknown;
  resolveDomain: (host: string) => Promise<string | null>;
}): Promise<SiteIdentity | null> {
  const host = input.host.toLowerCase().split(":")[0];
  if (!/^[a-z0-9.[\]:-]{1,253}$/.test(host) || !input.origin) return null;
  let originHost: string;
  try {
    originHost = new URL(input.origin).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (originHost !== host) return null;
  if (input.platformHosts.includes(host)) {
    const match = typeof input.path === "string" ? /^\/r\/([^/?#]{1,64})/.exec(input.path) : null;
    if (!match) return null;
    let restaurant: string;
    try {
      restaurant = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    return /^[\p{L}\p{N}_-]+$/u.test(restaurant) ? { restaurant, site: "platform", platform: true } : null;
  }
  const restaurant = await input.resolveDomain(host);
  return restaurant ? { restaurant, site: host, platform: false } : null;
}
/** Empreinte de transit : calculée puis oubliée, jamais stockée telle quelle (voir app.analytics_ingest). */
export const transientFingerprint = (address: string, userAgent: string) =>
  createHash("sha256").update(`${address}\0${userAgent}`).digest("hex");
export function clientAddress(headers: HeaderReader) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
