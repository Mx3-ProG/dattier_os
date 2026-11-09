/* Consolidation des heures à partir du pointage. Calcul pur, entièrement testable.
   Une heure incertaine n’est jamais estimée : la période reste non comptée et signalée.
   Les heures sont rattachées au jour de prise de poste, à l’heure de Paris. */

export type ClockEvent = {
  id: string;
  profileId: string;
  event: "start" | "break" | "resume" | "end";
  at: string;
};
export type Rules = {
  baseMinutes: number;
  band1Until: number;
  band2Until: number;
  band1RateBp: number;
  band2RateBp: number;
  band3RateBp: number;
};
export type Anomaly = {
  kind: "missing_end" | "bad_sequence" | "long_day" | "no_clock";
  day: string;
  message: string;
};
export const parisDay = (at: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(at),
  );
const addDays = (day: string, by: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400_000)
    .toISOString()
    .slice(0, 10);
/** Lundi de la semaine du jour donné. */
export const weekStart = (day: string) => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
};
export const weekEnd = (day: string) => addDays(weekStart(day), 6);
const longDayMinutes = 12 * 60;
/** Au-delà, un service sans sortie n’est plus considéré comme en cours. */
const runningLimitMs = 16 * 3600_000;

/** Minutes travaillées par jour, et anomalies d’un employé. Les pauses ne comptent pas. */
export function consolidate(events: ClockEvent[], now = new Date()) {
  const days = new Map<string, number>();
  const anomalies: Anomaly[] = [];
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  let shiftDay: string | null = null;
  let segmentFrom: string | null = null;
  let paused = false;
  const close = (at: string) => {
    if (!segmentFrom || !shiftDay) return;
    const minutes = Math.round(
      (Date.parse(at) - Date.parse(segmentFrom)) / 60_000,
    );
    days.set(shiftDay, (days.get(shiftDay) ?? 0) + minutes);
    segmentFrom = null;
  };
  const lost = () => {
    if (shiftDay && (segmentFrom || paused))
      anomalies.push({
        kind: "missing_end",
        day: shiftDay,
        message: "Sortie non pointée : ce service n’est pas compté en entier.",
      });
    shiftDay = null;
    segmentFrom = null;
    paused = false;
  };
  for (const e of sorted) {
    const day = parisDay(e.at);
    const bad = () =>
      anomalies.push({
        kind: "bad_sequence",
        day,
        message: "Pointage incohérent : à vérifier.",
      });
    if (e.event === "start") {
      if (shiftDay) lost();
      shiftDay = day;
      segmentFrom = e.at;
    } else if (e.event === "break") {
      if (!segmentFrom) bad();
      else {
        close(e.at);
        paused = true;
      }
    } else if (e.event === "resume") {
      if (!paused) bad();
      else {
        segmentFrom = e.at;
        paused = false;
      }
    } else {
      if (!shiftDay) bad();
      else {
        close(e.at);
        shiftDay = null;
        paused = false;
      }
    }
  }
  if (shiftDay) {
    const last = sorted.at(-1)!;
    // Service encore en cours : ni compté, ni signalé.
    if (now.getTime() - Date.parse(last.at) > runningLimitMs) lost();
  }
  for (const [day, minutes] of days)
    if (minutes > longDayMinutes)
      anomalies.push({
        kind: "long_day",
        day,
        message: `Journée de ${(minutes / 60).toFixed(1)} h : à vérifier.`,
      });
  return { days, anomalies };
}

/** Répartition d’une semaine. Complémentaires : au-delà du contrat, jusqu’à la durée de base. */
export function splitWeek(minutes: number, contract: number | null, r: Rules) {
  const band = (from: number, to: number) =>
    Math.max(0, Math.min(minutes, to) - from);
  const complementary =
    contract !== null && contract < r.baseMinutes
      ? band(contract, r.baseMinutes)
      : 0;
  return {
    minutes,
    complementary,
    band1: band(r.baseMinutes, r.band1Until),
    band2: band(r.band1Until, r.band2Until),
    band3: Math.max(0, minutes - r.band2Until),
  };
}
export const premium = (
  week: { band1: number; band2: number; band3: number },
  hourlyRate: number,
  r: Rules,
) =>
  ((week.band1 * r.band1RateBp +
    week.band2 * r.band2RateBp +
    week.band3 * r.band3RateBp) /
    60 /
    10000) *
  hourlyRate;

/** Jours ouvrables (hors dimanche) d’une absence sur une période. Fériés non déduits. */
export function workingDays(
  from: string,
  to: string,
  periodFrom: string,
  periodTo: string,
) {
  let count = 0;
  const end = to < periodTo ? to : periodTo;
  for (
    let day = from > periodFrom ? from : periodFrom;
    day <= end;
    day = addDays(day, 1)
  )
    if (new Date(`${day}T00:00:00Z`).getUTCDay() !== 0) count += 1;
  return count;
}
export const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
};
