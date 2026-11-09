/**
 * Géolocalisation approximative lue dans les en-têtes posés par l’hébergeur.
 * Aucune position GPS, aucune base d’adresses IP. Ces en-têtes ne sont fiables que derrière
 * le proxy qui les écrase : sans source déclarée, la zone reste « inconnue ».
 */
export type GeoSource = "vercel" | "cloudflare" | "none";
export type ApproximateGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
};
export const unknownGeo: ApproximateGeo = { country: null, region: null, city: null, lat: null, lng: null };
type HeaderReader = { get(name: string): string | null };

export function geoSource(env: Record<string, string | undefined> = process.env): GeoSource {
  const declared = env.ANALYTICS_GEO_SOURCE;
  if (declared === "vercel" || declared === "cloudflare" || declared === "none") return declared;
  return env.VERCEL ? "vercel" : "none";
}
const decode = (value: string | null) => {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};
const cleanText = (value: string | null, max: number) => {
  const text = decode(value)?.trim();
  // Refuse les valeurs de remplissage et les caractères de contrôle.
  return text && !/^(unknown|xx|t1)$/i.test(text) && !/\p{Cc}/u.test(text) ? text.slice(0, max) : null;
};
const coordinate = (value: string | null, limit: number) => {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
};
const countryCode = (value: string | null) => {
  const code = value?.trim().toUpperCase() ?? "";
  // XX, T1 : codes Cloudflare « inconnu » et « Tor ».
  return /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : null;
};
const names: Record<Exclude<GeoSource, "none">, Record<keyof ApproximateGeo, string>> = {
  vercel: {
    country: "x-vercel-ip-country",
    region: "x-vercel-ip-country-region",
    city: "x-vercel-ip-city",
    lat: "x-vercel-ip-latitude",
    lng: "x-vercel-ip-longitude",
  },
  cloudflare: {
    country: "cf-ipcountry",
    region: "cf-region-code",
    city: "cf-ipcity",
    lat: "cf-iplatitude",
    lng: "cf-iplongitude",
  },
};
export function geoFromHeaders(headers: HeaderReader, source: GeoSource = geoSource()): ApproximateGeo {
  if (source === "none") return unknownGeo;
  const n = names[source];
  const country = countryCode(headers.get(n.country));
  if (!country) return unknownGeo;
  return {
    country,
    region: cleanText(headers.get(n.region), 64),
    city: cleanText(headers.get(n.city), 96),
    lat: coordinate(headers.get(n.lat), 90),
    lng: coordinate(headers.get(n.lng), 180),
  };
}
