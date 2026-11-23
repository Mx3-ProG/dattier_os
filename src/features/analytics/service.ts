import { z } from "zod";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { rows, one, type DB } from "@/infrastructure/database/db";
import { can } from "@/core/permissions";
import { geoBreakdown, toZones, type GeoRow } from "./aggregate";
import { geoSource } from "./geo";
import { earthTrackerProduct } from "./modules";
import { ANALYTICS_TIME_ZONE, daysOf, type Period } from "./period";

/** API de consultation. Toutes les lectures passent par la RLS, en plus du filtre explicite. */
export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    consentMode: z.enum(["consent_required", "exemption_declared"]),
    /** Exigé pour activer le mode sans consentement : engagement explicite de l’établissement. */
    exemptionAcknowledged: z.boolean().optional(),
    geoPrecision: z.enum(["country", "region", "city"]),
    retentionDays: z.number().int().min(30).max(790),
    revision: z.number().int().min(0),
  })
  .strict()
  .refine((v) => v.consentMode !== "exemption_declared" || v.exemptionAcknowledged === true, {
    message: "Confirmez l’examen des conditions d’exemption avant de choisir ce mode.",
  });
export type AnalyticsSettings = {
  collection_enabled: boolean;
  consent_mode: "consent_required" | "exemption_declared";
  exemption_declared_at: string | null;
  geo_precision: "country" | "region" | "city";
  retention_days: number;
  revision: number;
};
export const defaultAnalyticsSettings: AnalyticsSettings = {
  collection_enabled: false,
  consent_mode: "consent_required",
  exemption_declared_at: null,
  geo_precision: "city",
  retention_days: 395,
  revision: 0,
};
const orgAdmin = async (db: DB, restaurant: string) =>
  (
    await one<{ admin: boolean }>(
      db,
      "SELECT app.org_admin((SELECT organization_id FROM restaurants WHERE id=$1)) AS admin",
      [restaurant],
    )
  ).admin;

/** Droit du profil et licence de l’établissement : l’un ne remplace jamais l’autre. */
export async function requireEarthTracker(db: DB, user: Actor, restaurant: string) {
  const scoped = await scope(db, user, restaurant);
  if (!can(scoped.roles ?? scoped.role, "analytics")) throw new Error("Accès refusé pour ce profil.");
  const { allowed } = await one<{ allowed: boolean }>(
    db,
    "SELECT app.analytics_licensed_for($1,$2) AS allowed",
    [restaurant, earthTrackerProduct],
  );
  if (!allowed) throw new Error("Add-on Earth Tracker 3D non activé : accès refusé pour cet établissement.");
  return scoped;
}
const dayStart = (day: string) => `${day} 00:00:00`;
const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
export const PLATFORM_SITE = "platform";

/** Vue agrégée si `site` est null ; sinon un seul site de cet établissement. */
export async function readSummary(db: DB, restaurant: string, period: Period, site: string | null) {
  const siteFilter = "AND ($4::text IS NULL OR site_host=$4)";
  const trafficRange = `restaurant_id=$1 AND hour>=($2::timestamp AT TIME ZONE '${ANALYTICS_TIME_ZONE}') AND hour<($3::timestamp AT TIME ZONE '${ANALYTICS_TIME_ZONE}') ${siteFilter}`;
  const trafficArgs = [restaurant, dayStart(period.from), dayStart(nextDay(period.to)), site];
  const totals = await one<{ requests: number; filtered: number; pageviews: number; sessions: number; visitors: number }>(
    db,
    `SELECT coalesce(sum(requests),0)::float AS requests,coalesce(sum(filtered),0)::float AS filtered,coalesce(sum(pageviews),0)::float AS pageviews,
            coalesce(sum(sessions),0)::float AS sessions,coalesce(sum(visitors),0)::float AS visitors
       FROM analytics_traffic_hourly WHERE ${trafficRange}`,
    trafficArgs,
  );
  const hourly = period.days === 1;
  const bucket = hourly
    ? `to_char(hour AT TIME ZONE '${ANALYTICS_TIME_ZONE}','YYYY-MM-DD"T"HH24')`
    : `to_char(hour AT TIME ZONE '${ANALYTICS_TIME_ZONE}','YYYY-MM-DD')`;
  const seriesRows = await rows<{ bucket: string; pageviews: number; sessions: number; visitors: number }>(
    db,
    `SELECT ${bucket} AS bucket,sum(pageviews)::float AS pageviews,sum(sessions)::float AS sessions,sum(visitors)::float AS visitors
       FROM analytics_traffic_hourly WHERE ${trafficRange} GROUP BY 1 ORDER BY 1`,
    trafficArgs,
  );
  const byBucket = new Map(seriesRows.map((row) => [row.bucket, row]));
  const buckets = hourly
    ? Array.from({ length: 24 }, (_, hour) => `${period.from}T${String(hour).padStart(2, "0")}`)
    : daysOf(period);
  const dayArgs = [restaurant, period.from, period.to, site];
  const geoRows = await rows<GeoRow>(
    db,
    `SELECT country,region,city,avg(lat)::float AS lat,avg(lng)::float AS lng,
            sum(pageviews)::float AS pageviews,sum(sessions)::float AS sessions,sum(visitors)::float AS visitors
       FROM analytics_geo_daily WHERE restaurant_id=$1 AND day BETWEEN $2::date AND $3::date ${siteFilter}
      GROUP BY country,region,city ORDER BY sum(pageviews) DESC LIMIT 2000`,
    dayArgs,
  );
  const pages = await rows<{ path: string; pageviews: number }>(
    db,
    `SELECT path,sum(pageviews)::float AS pageviews FROM analytics_pages_daily
      WHERE restaurant_id=$1 AND day BETWEEN $2::date AND $3::date ${siteFilter}
      GROUP BY path ORDER BY 2 DESC,path LIMIT 10`,
    dayArgs,
  );
  const { countries, cities, continents, regions, countryCount, unplaced } = geoBreakdown(geoRows);
  return {
    period,
    totals: { ...totals, countries: countryCount, unplaced },
    series: buckets.map((key) => ({
      bucket: key,
      pageviews: byBucket.get(key)?.pageviews ?? 0,
      sessions: byBucket.get(key)?.sessions ?? 0,
      visitors: byBucket.get(key)?.visitors ?? 0,
    })),
    zones: toZones(geoRows),
    countries,
    cities: cities.slice(0, 10),
    continents,
    regions,
    pages,
  };
}
export type AnalyticsSummary = Awaited<ReturnType<typeof readSummary>>;
export type Pulse = {
  occurred_at: string;
  site_host: string;
  country: string;
  region: string;
  city: string;
  lat: number | null;
  lng: number | null;
};
/** Curseur temporel propre à l’établissement : ne révèle rien du volume des autres. */
export async function readPulses(db: DB, restaurant: string, site: string | null, since: string | null, limit = 50) {
  const found = await rows<Pulse>(
    db,
    `SELECT occurred_at,site_host,country,region,city,lat::float AS lat,lng::float AS lng FROM analytics_pulses
      WHERE restaurant_id=$1 AND ($2::text IS NULL OR site_host=$2) AND ($3::timestamptz IS NULL OR occurred_at>$3::timestamptz)
      ORDER BY occurred_at DESC LIMIT $4`,
    [restaurant, site, since, Math.min(limit, 50)],
  );
  return found;
}
export async function readSites(db: DB, restaurant: string) {
  const found = await rows<{ site_host: string }>(
    db,
    "SELECT DISTINCT site_host FROM analytics_traffic_hourly WHERE restaurant_id=$1 ORDER BY site_host",
    [restaurant],
  );
  const primary = await rows<{ host: string | null }>(db, "SELECT app.primary_domain($1) AS host", [restaurant]);
  return [...new Set([PLATFORM_SITE, ...(primary[0]?.host ? [primary[0].host] : []), ...found.map((row) => row.site_host)])];
}
export async function readSettings(db: DB, restaurant: string): Promise<AnalyticsSettings> {
  const found = await rows<AnalyticsSettings>(
    db,
    "SELECT collection_enabled,consent_mode,exemption_declared_at,geo_precision,retention_days,revision FROM analytics_settings WHERE restaurant_id=$1",
    [restaurant],
  );
  return found[0] ?? defaultAnalyticsSettings;
}
export async function readOverview(db: DB, user: Actor, restaurant: string, period: Period, site: string | null) {
  const scoped = await requireEarthTracker(db, user, restaurant);
  const summary = await readSummary(db, restaurant, period, site);
  const pulses = await readPulses(db, restaurant, site, null, 12);
  const sites = await readSites(db, restaurant);
  const settings = await readSettings(db, restaurant);
  return {
    ...summary,
    pulses,
    cursor: pulses[0]?.occurred_at ?? new Date().toISOString(),
    sites,
    settings,
    geoAvailable: geoSource() !== "none",
    canManage: can(scoped.roles ?? scoped.role, "settings"),
    canPurge: await orgAdmin(db, restaurant),
  };
}
export type AnalyticsOverview = Awaited<ReturnType<typeof readOverview>>;
export async function readLive(db: DB, user: Actor, restaurant: string, site: string | null, since: string) {
  await requireEarthTracker(db, user, restaurant);
  const pulses = await readPulses(db, restaurant, site, since);
  return { pulses, cursor: pulses[0]?.occurred_at ?? since };
}
export async function saveSettings(db: DB, user: Actor, restaurant: string, raw: unknown) {
  const value = settingsSchema.parse(raw);
  await scope(db, user, restaurant);
  await db.query("SELECT app.analytics_save_settings($1,$2,$3,$4,$5,$6)", [
    restaurant,
    value.enabled,
    value.consentMode,
    value.geoPrecision,
    value.retentionDays,
    value.revision,
  ]);
  return readSettings(db, restaurant);
}
export async function purgeStatistics(db: DB, user: Actor, restaurant: string) {
  await scope(db, user, restaurant);
  await db.query("SELECT app.analytics_purge($1)", [restaurant]);
}
