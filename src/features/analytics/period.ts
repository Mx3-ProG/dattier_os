import { z } from "zod";

/** Les journées statistiques suivent le fuseau utilisé par le moteur SQL. */
export const ANALYTICS_TIME_ZONE = "Europe/Paris";
export const MAX_RANGE_DAYS = 400;
export const rangeKeys = ["today", "7d", "30d", "90d", "custom"] as const;
export type RangeKey = (typeof rangeKeys)[number];
export type Period = { key: RangeKey; from: string; to: string; days: number };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const periodQuery = z.object({
  range: z.enum(rangeKeys).default("7d"),
  from: date.optional(),
  to: date.optional(),
});
export function localDay(at: Date = new Date(), timeZone = ANALYTICS_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
const shift = (day: string, delta: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
const span = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export function resolvePeriod(query: z.input<typeof periodQuery>, now: Date = new Date()): Period {
  const { range, from, to } = periodQuery.parse(query);
  const today = localDay(now);
  if (range === "custom") {
    if (!from || !to) throw new Error("Période personnalisée incomplète.");
    const validDay = (day: string) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && shift(day, 0) === day;
    if (!validDay(from) || !validDay(to)) throw new Error("Période personnalisée invalide.");
    const end = to > today ? today : to;
    if (from > end) throw new Error("Période personnalisée invalide.");
    const days = span(from, end);
    if (days > MAX_RANGE_DAYS) throw new Error("Période trop longue (400 jours au maximum).");
    return { key: range, from, to: end, days };
  }
  const days = { today: 1, "7d": 7, "30d": 30, "90d": 90 }[range];
  return { key: range, from: shift(today, 1 - days), to: today, days };
}
/** Tous les jours de la période, pour ne pas masquer les jours sans visite dans les graphiques. */
export function daysOf(period: Pick<Period, "from" | "to">) {
  const out: string[] = [];
  for (let day = period.from; day <= period.to; day = shift(day, 1)) out.push(day);
  return out;
}
