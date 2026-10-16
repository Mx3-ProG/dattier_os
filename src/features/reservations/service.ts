import { randomUUID as uuid } from "node:crypto";
import { z } from "zod";
import { rows, one, type DB } from "@/lib/database/db";
import { log, notify } from "@/features/orders/service";

/**
 * Horaires de réservation en ligne (heure de Paris). Valeurs de démonstration
 * à valider avec l’établissement : un seul endroit à modifier.
 */
export const booking = {
  services: [
    { id: "midi", name: "Déjeuner", from: "12:00", to: "13:30" },
    { id: "soir", name: "Dîner", from: "19:00", to: "21:30" },
  ],
  stepMinutes: 30,
  durationMinutes: 120,
  /** 0 = dimanche … 6 = samedi. */
  closedWeekdays: [1],
  horizonDays: 60,
  leadMinutes: 60,
};

const TZ = "Europe/Paris";
const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
function paris(ms: number) {
  const p = Object.fromEntries(
    parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    utc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second),
  };
}
/** Convertit une date et une heure locales de Paris en instant UTC (ms). */
export function parisToUtc(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number),
    [h, min] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let guess = wall - (paris(wall).utc - wall);
  guess += wall - paris(guess).utc;
  return guess;
}
export const parisDate = (ms: number) => paris(ms).date;
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function serviceSlots() {
  return booking.services.map((s) => {
    const times: string[] = [];
    for (let m = minutes(s.from); m <= minutes(s.to); m += booking.stepMinutes)
      times.push(clock(m));
    return { ...s, times };
  });
}
function dayState(date: string, now = Date.now()) {
  const today = parisDate(now);
  if (date < today || date > addDays(today, booking.horizonDays))
    return "past" as const;
  if (booking.closedWeekdays.includes(weekday(date))) return "closed" as const;
  return "open" as const;
}

export type PublicTable = {
  id: string;
  number: number;
  capacity: number;
  label: string;
  zone: string;
  shape: string;
  pos_x: number;
  pos_y: number;
  status: string;
};
type Hold = { table_id: string; starts_at: string; ends_at: string };

async function load(db: DB, r: string, from: number, to: number) {
  const tables = await rows<PublicTable>(
    db,
    "SELECT id,number,capacity,label,zone,shape,pos_x,pos_y,status FROM dining_tables WHERE restaurant_id=$1 AND bookable AND archived_at IS NULL ORDER BY number",
    [r],
  );
  const holds = await rows<Hold>(
    db,
    "SELECT table_id,starts_at,ends_at FROM reservations WHERE restaurant_id=$1 AND table_id IS NOT NULL AND status IN ('requested','confirmed','arrived') AND starts_at<$3 AND ends_at>$2",
    [r, new Date(from).toISOString(), new Date(to).toISOString()],
  );
  return {
    tables,
    holds: holds.map((h) => ({
      table: h.table_id,
      start: Date.parse(h.starts_at),
      end: Date.parse(h.ends_at),
    })),
  };
}
function freeAt(
  data: Awaited<ReturnType<typeof load>>,
  start: number,
  guests: number,
  today: boolean,
) {
  const end = start + booking.durationMinutes * 60000;
  return data.tables
    .filter(
      (t) =>
        t.capacity >= guests &&
        !(today && t.status === "unavailable") &&
        !data.holds.some(
          (h) => h.table === t.id && h.start < end && h.end > start,
        ),
    )
    .map((t) => t.id);
}
const bookableAfter = (now: number) => now + booking.leadMinutes * 60000;

export const calendarQuery = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  guests: z.coerce.number().int().min(1).max(20),
});
/** Vue mensuelle : nombre de créneaux réservables par jour. */
export async function calendar(
  db: DB,
  r: string,
  q: z.infer<typeof calendarQuery>,
  now = Date.now(),
) {
  const first = `${q.month}-01`,
    days: string[] = [];
  for (let d = first; d.startsWith(q.month); d = addDays(d, 1)) days.push(d);
  const data = await load(
    db,
    r,
    parisToUtc(first, "00:00"),
    parisToUtc(addDays(days.at(-1)!, 1), "06:00"),
  );
  const slots = serviceSlots().flatMap((s) => s.times),
    today = parisDate(now),
    largest = Math.max(0, ...data.tables.map((t) => t.capacity)),
    // Groupe plus grand que toute table : demande sans table, l’équipe organise.
    group = q.guests > largest;
  return {
    month: q.month,
    largest,
    group,
    days: days.map((date) => {
      const state = dayState(date, now);
      if (state !== "open") return { date, status: state, free: 0, total: 0 };
      const free = slots.filter((t) => {
        const start = parisToUtc(date, t);
        return (
          start >= bookableAfter(now) &&
          (group || freeAt(data, start, q.guests, date === today).length > 0)
        );
      }).length;
      return {
        date,
        status:
          free === 0
            ? "full"
            : free <= Math.ceil(slots.length / 3)
              ? "limited"
              : "available",
        free,
        total: slots.length,
      };
    }),
  };
}

export const dayQuery = z.object({
  date: z.string().date(),
  guests: z.coerce.number().int().min(1).max(20),
});
/** Vue d’une journée : créneaux et tables libres pour chacun, plan public. */
export async function availability(
  db: DB,
  r: string,
  q: z.infer<typeof dayQuery>,
  now = Date.now(),
) {
  const data = await load(
    db,
    r,
    parisToUtc(q.date, "00:00"),
    parisToUtc(addDays(q.date, 1), "06:00"),
  );
  const open = dayState(q.date, now) === "open",
    today = q.date === parisDate(now),
    group = !data.tables.some((t) => t.capacity >= q.guests);
  return {
    date: q.date,
    open,
    group,
    durationMinutes: booking.durationMinutes,
    tables: data.tables.map(({ status, ...t }) => ({
      ...t,
      unavailable: today && status === "unavailable",
    })),
    services: serviceSlots().map((s) => ({
      id: s.id,
      name: s.name,
      slots: s.times.map((time) => {
        const start = parisToUtc(q.date, time),
          bookable = open && start >= bookableAfter(now),
          free = bookable ? freeAt(data, start, q.guests, today) : [];
        return {
          time,
          start: new Date(start).toISOString(),
          bookable: bookable && (group || free.length > 0),
          past: !bookable,
          free,
        };
      }),
    })),
  };
}

const text = z.string().trim().min(1).max(300);
export const reservationSchema = z.object({
  restaurant: z.string().min(1),
  name: text,
  contact: text,
  guests: z.coerce.number().int().min(1).max(20),
  start: z.string().datetime(),
  table: z.string().min(1).optional(),
  note: z.string().max(300).default(""),
});
/** Demande publique : créneau d’ouverture, table libre verrouillée si choisie. */
export async function requestReservation(
  db: DB,
  a: z.infer<typeof reservationSchema>,
  now = Date.now(),
) {
  const start = Date.parse(a.start),
    local = paris(start);
  if (start < now) throw new Error("Choisissez un créneau futur.");
  if (
    dayState(local.date, now) !== "open" ||
    !serviceSlots().some((s) => s.times.includes(local.time)) ||
    start < bookableAfter(now)
  )
    throw new Error("Ce créneau n’est pas ouvert à la réservation.");
  await one(db, "SELECT id FROM restaurants WHERE id=$1", [a.restaurant]);
  const end = start + booking.durationMinutes * 60000;
  if (a.table) {
    // Verrou de ligne : deux demandes simultanées sur la même table se suivent.
    const t = await one<{ capacity: number; status: string }>(
      db,
      "SELECT capacity,status FROM dining_tables WHERE id=$1 AND restaurant_id=$2 AND bookable AND archived_at IS NULL FOR UPDATE",
      [a.table, a.restaurant],
    );
    if (t.capacity < a.guests)
      throw new Error("Cette table est trop petite pour votre groupe.");
  }
  const data = await load(db, a.restaurant, start, end);
  const free = freeAt(data, start, a.guests, local.date === parisDate(now));
  if (a.table && !free.includes(a.table))
    throw new Error(
      "Cette table vient d’être réservée sur ce créneau. Choisissez-en une autre.",
    );
  if (
    !a.table &&
    data.tables.some((t) => t.capacity >= a.guests) &&
    !free.length
  )
    throw new Error("Ce créneau est complet.");
  const id = uuid();
  await db.query(
    "INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at,table_id,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      a.restaurant,
      a.name,
      a.contact,
      a.guests,
      new Date(start).toISOString(),
      new Date(end).toISOString(),
      a.table ?? null,
      a.note,
    ],
  );
  const number = a.table
    ? (
        await one<{ number: number }>(
          db,
          "SELECT number FROM dining_tables WHERE id=$1",
          [a.table],
        )
      ).number
    : null;
  await notify(
    db,
    a.restaurant,
    `Nouvelle demande de réservation · ${a.guests} pers. · ${local.time}${number ? ` · table ${number}` : ""}`,
  );
  await log(db, a.restaurant, null, "Demande de réservation publique", id);
  return id;
}
