import { countryGeo, type ContinentCode } from "./country-geo";

/** Consolidation pure des zones. Tous les pourcentages partent du même total : ils restent cohérents. */
export const UNKNOWN_COUNTRY = "ZZ";
export type GeoRow = {
  country: string;
  region: string;
  city: string;
  lat: number | null;
  lng: number | null;
  pageviews: number;
  sessions: number;
  visitors: number;
};
export type Ranked = {
  key: string;
  label: string;
  country?: string;
  pageviews: number;
  sessions: number;
  visitors: number;
  share: number;
};
export type Zone = GeoRow & { continent: ContinentCode | null; label: string; countryLabel: string; approximate: boolean };

export const continentLabels: Record<ContinentCode | "??", string> = {
  AF: "Afrique",
  AN: "Antarctique",
  AS: "Asie",
  EU: "Europe",
  NA: "Amérique du Nord",
  OC: "Océanie",
  SA: "Amérique du Sud",
  "??": "Position inconnue",
};
let display: Intl.DisplayNames | undefined;
export function countryName(code: string) {
  if (code === UNKNOWN_COUNTRY) return "Position inconnue";
  try {
    display ??= new Intl.DisplayNames(["fr"], { type: "region" });
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}
export const continentOf = (country: string): ContinentCode | null =>
  countryGeo[country]?.[1] ?? null;
/**
 * Point affichable d’une zone : sa maille approximative, sinon le centre du pays.
 * `null` si le pays est inconnu : la zone reste comptée, mais n’est pas placée.
 */
export function zonePosition(row: Pick<GeoRow, "country" | "lat" | "lng">) {
  if (row.lat !== null && row.lng !== null) return { lat: row.lat, lng: row.lng, approximate: false };
  const entry = countryGeo[row.country];
  return entry && entry[2] !== null && entry[3] !== null
    ? { lat: entry[2], lng: entry[3], approximate: true }
    : null;
}
export function zoneLabel(row: Pick<GeoRow, "country" | "region" | "city">) {
  const country = countryName(row.country);
  if (row.city) return `${row.city}, ${country}`;
  if (row.region) return `Région ${row.region}, ${country}`;
  return country;
}
export function toZones(rows: readonly GeoRow[]): Zone[] {
  return rows.map((row) => ({
    ...row,
    continent: continentOf(row.country),
    label: zoneLabel(row),
    countryLabel: countryName(row.country),
    approximate: !(row.lat !== null && row.lng !== null),
  }));
}
function rank(
  rows: readonly GeoRow[],
  keyOf: (row: GeoRow) => string | null,
  labelOf: (key: string, row: GeoRow) => string,
  total: number,
  countryOf?: (row: GeoRow) => string,
): Ranked[] {
  const map = new Map<string, Ranked>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const entry = map.get(key) ?? {
      key,
      label: labelOf(key, row),
      ...(countryOf ? { country: countryOf(row) } : {}),
      pageviews: 0,
      sessions: 0,
      visitors: 0,
      share: 0,
    };
    entry.pageviews += row.pageviews;
    entry.sessions += row.sessions;
    entry.visitors += row.visitors;
    map.set(key, entry);
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, share: total ? entry.pageviews / total : 0 }))
    .sort((a, b) => b.pageviews - a.pageviews || a.label.localeCompare(b.label, "fr"));
}
export function geoBreakdown(rows: readonly GeoRow[]) {
  const total = rows.reduce((sum, row) => sum + row.pageviews, 0);
  const countries = rank(rows, (r) => r.country, (key) => countryName(key), total, (r) => r.country);
  return {
    total,
    countries,
    /** Pays réellement identifiés : une position inconnue n’est pas un pays représenté. */
    countryCount: countries.filter((entry) => entry.key !== UNKNOWN_COUNTRY).length,
    cities: rank(rows, (r) => (r.city ? `${r.country}|${r.city}` : null), (_k, r) => `${r.city}, ${countryName(r.country)}`, total, (r) => r.country),
    continents: rank(rows, (r) => continentOf(r.country) ?? "??", (key) => continentLabels[key as ContinentCode | "??"], total),
    regions: rank(rows, (r) => (r.region ? `${r.country}|${r.region}` : null), (_k, r) => `Région ${r.region}, ${countryName(r.country)}`, total, (r) => r.country),
    unplaced: rows.filter((row) => !zonePosition(row)).reduce((sum, row) => sum + row.pageviews, 0),
  };
}
