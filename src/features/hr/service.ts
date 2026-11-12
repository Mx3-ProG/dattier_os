/* Couche RH au-dessus du pointage : heures, corrections tracées, absences, contrats,
   coût de personnel et variables préparées pour le gestionnaire de paie.
   Ne produit ni bulletin ni déclaration sociale. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { can, requirePermission } from "@/core/permissions";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { log } from "@/features/orders/service";
import {
  consolidate,
  monthBounds,
  parisDay,
  premium,
  splitWeek,
  weekEnd,
  weekStart,
  workingDays,
  type Anomaly,
  type ClockEvent,
  type Rules,
} from "./hours";

type Settings = {
  base_minutes: number;
  band1_until: number;
  band2_until: number;
  band1_rate_bp: number;
  band2_rate_bp: number;
  band3_rate_bp: number;
  employer_rate_bp: number | null;
  rules_confirmed: boolean;
};
type Contract = {
  id: string;
  profile_id: string;
  kind: string;
  weekly_minutes: number;
  hourly_rate: number;
  starts_on: string;
  ends_on: string | null;
};
const absenceLabels: Record<string, string> = {
  paid_leave: "Congés payés",
  sick: "Maladie",
  unpaid: "Sans solde",
  family: "Événement familial",
  other: "Autre",
};

async function teamAccess(db: DB, r: string, user: Actor) {
  const scoped = await scope(db, user, r);
  const [attendance,payrollRight]=await Promise.all([
    one<{installed:boolean}>(db,"SELECT app.addon_installed($1,'attendance') AS installed",[r]),
    one<{installed:boolean}>(db,"SELECT app.addon_installed($1,'payroll') AS installed",[r]),
  ]);
  if (!attendance.installed && !payrollRight.installed)
    throw new Error("Les add-ons Présences et Paie ne sont pas actifs pour cet établissement.");
  const roles = scoped.roles ?? scoped.role;
  if (!can(roles, "team") && !can(roles, "payroll"))
    throw new Error("Accès refusé pour ce profil.");
  return { scoped, payroll: can(roles, "payroll"), attendance: attendance.installed };
}
async function payrollAccess(db: DB, r: string, user: Actor) {
  const scoped = await scope(db, user, r);
  requirePermission(scoped.roles ?? scoped.role, "payroll");
  await requirePaidAddon(db,r,"payroll");
  return scoped;
}
async function settingsOf(db: DB, r: string) {
  await db.query(
    "INSERT INTO hr_settings(restaurant_id) SELECT $1::text WHERE app.fin_access($1::text) ON CONFLICT DO NOTHING",
    [r],
  );
  const found = await rows<Settings>(
    db,
    "SELECT * FROM hr_settings WHERE restaurant_id=$1",
    [r],
  );
  return (
    found[0] ?? {
      base_minutes: 2100,
      band1_until: 2340,
      band2_until: 2580,
      band1_rate_bp: 1000,
      band2_rate_bp: 2000,
      band3_rate_bp: 5000,
      employer_rate_bp: null,
      rules_confirmed: false,
    }
  );
}
const rulesOf = (s: Settings): Rules => ({
  baseMinutes: s.base_minutes,
  band1Until: s.band1_until,
  band2Until: s.band2_until,
  band1RateBp: s.band1_rate_bp,
  band2RateBp: s.band2_rate_bp,
  band3RateBp: s.band3_rate_bp,
});
const contractOn = (list: Contract[], profile: string, day: string) =>
  list.find(
    (c) =>
      c.profile_id === profile &&
      c.starts_on <= day &&
      (!c.ends_on || c.ends_on >= day),
  );

/** Heures de chaque employé sur des semaines entières couvrant la période. */
async function hoursOf(db: DB, r: string, from: string, to: string) {
  const start = weekStart(from),
    end = weekEnd(to);
  const entries = await rows<{
    id: string;
    profile_id: string;
    event: ClockEvent["event"];
    at: string;
  }>(
    db,
    `SELECT id,profile_id,event,created_at AS at FROM time_entries
      WHERE restaurant_id=$1 AND voided_at IS NULL
        AND (created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date-1 AND $3::date+1
      ORDER BY created_at`,
    [r, start, end],
  );
  const people = await rows<{ id: string; name: string }>(
    db,
    "SELECT DISTINCT p.id,p.name FROM profiles p JOIN memberships m ON m.profile_id=p.id WHERE m.restaurant_id=$1 ORDER BY p.name",
    [r],
  );
  const shifts = await rows<{ profile_id: string; day: string }>(
    db,
    `SELECT profile_id,to_char(starts_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day
       FROM shifts WHERE restaurant_id=$1 AND starts_at<now()
        AND (starts_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date`,
    [r, from, to],
  );
  return people.map((person) => {
    const own = entries
      .filter((e) => e.profile_id === person.id)
      .map((e): ClockEvent => ({
        id: e.id,
        profileId: e.profile_id,
        event: e.event,
        // PGlite renvoie une date, PostgreSQL du texte : même forme pour le calcul.
        at: new Date(e.at).toISOString(),
      }));
    const { days, anomalies } = consolidate(own);
    const inPeriod = anomalies.filter((a) => a.day >= from && a.day <= to);
    const noClock: Anomaly[] = shifts
      .filter((s) => s.profile_id === person.id && !days.has(s.day))
      .filter((s) => !own.some((e) => parisDay(e.at) === s.day))
      .map((s) => ({
        kind: "no_clock",
        day: s.day,
        message: "Créneau planifié sans pointage.",
      }));
    return {
      id: person.id,
      name: person.name,
      days,
      anomalies: [...inPeriod, ...noClock],
      lastEvent: own.at(-1) ?? null,
    };
  });
}

/** Variables d’un mois. Une semaine appartient au mois de son dimanche. */
async function variablesFor(db: DB, r: string, month: string) {
  const { from, to } = monthBounds(month);
  const settings = await settingsOf(db, r);
  const rules = rulesOf(settings);
  const contracts = await rows<Contract>(
    db,
    "SELECT id,profile_id,kind,weekly_minutes,hourly_rate,starts_on::text,ends_on::text FROM hr_contracts WHERE restaurant_id=$1 ORDER BY starts_on DESC",
    [r],
  );
  const absences = await rows<{
    profile_id: string;
    kind: string;
    starts_on: string;
    ends_on: string;
  }>(
    db,
    "SELECT profile_id,kind,starts_on::text,ends_on::text FROM hr_absences WHERE restaurant_id=$1 AND status='approved' AND starts_on<=$3::date AND ends_on>=$2::date",
    [r, from, to],
  );
  const people = await hoursOf(db, r, from, to);
  const employees = people
    .map((p) => {
      let worked = 0;
      const weeks = new Map<string, number>();
      for (const [day, minutes] of p.days) {
        if (day >= from && day <= to) worked += minutes;
        const week = weekStart(day);
        weeks.set(week, (weeks.get(week) ?? 0) + minutes);
      }
      const totals = { complementary: 0, band1: 0, band2: 0, band3: 0 };
      for (const [week, minutes] of weeks) {
        const sunday = weekEnd(week);
        if (sunday < from || sunday > to) continue;
        const split = splitWeek(
          minutes,
          contractOn(contracts, p.id, sunday)?.weekly_minutes ?? null,
          rules,
        );
        totals.complementary += split.complementary;
        totals.band1 += split.band1;
        totals.band2 += split.band2;
        totals.band3 += split.band3;
      }
      const own = absences.filter((a) => a.profile_id === p.id);
      const absenceDays: Record<string, number> = {};
      for (const a of own)
        absenceDays[a.kind] =
          (absenceDays[a.kind] ?? 0) +
          workingDays(a.starts_on, a.ends_on, from, to);
      return {
        profileId: p.id,
        name: p.name,
        hasContract: contracts.some((c) => c.profile_id === p.id),
        workedMinutes: worked,
        ...totals,
        absenceDays,
        anomalies: p.anomalies,
      };
    })
    .filter(
      (e) =>
        e.workedMinutes > 0 ||
        e.anomalies.length > 0 ||
        Object.keys(e.absenceDays).length > 0 ||
        e.hasContract,
    );
  return {
    month,
    from,
    to,
    rulesConfirmed: settings.rules_confirmed,
    employees,
  };
}
export type MonthVariables = Awaited<ReturnType<typeof variablesFor>>;

/** Coût estimé d’une période. Aucun taux supposé : un employé sans contrat est signalé. */
export async function staffCost(db: DB, r: string, from: string, to: string) {
  const [settings, contracts, people] = [
    await settingsOf(db, r),
    await rows<Contract>(
      db,
      "SELECT id,profile_id,kind,weekly_minutes,hourly_rate,starts_on::text,ends_on::text FROM hr_contracts WHERE restaurant_id=$1 ORDER BY starts_on DESC",
      [r],
    ),
    await hoursOf(db, r, from, to),
  ];
  const rules = rulesOf(settings);
  let gross = 0,
    worked = 0;
  const unknown = new Set<string>();
  let anomalies = 0;
  for (const p of people) {
    anomalies += p.anomalies.length;
    const weeks = new Map<string, number>();
    for (const [day, minutes] of p.days) {
      const week = weekStart(day);
      weeks.set(week, (weeks.get(week) ?? 0) + minutes);
      if (day < from || day > to) continue;
      worked += minutes;
      const contract = contractOn(contracts, p.id, day);
      if (!contract) unknown.add(p.name);
      else gross += (minutes / 60) * contract.hourly_rate;
    }
    for (const [week, minutes] of weeks) {
      const sunday = weekEnd(week);
      if (sunday < from || sunday > to) continue;
      const contract = contractOn(contracts, p.id, sunday);
      if (contract)
        gross += premium(
          splitWeek(minutes, contract.weekly_minutes, rules),
          contract.hourly_rate,
          rules,
        );
    }
  }
  const employerRate = settings.employer_rate_bp;
  return {
    contracts: contracts.length,
    workedMinutes: worked,
    gross: Math.round(gross),
    loaded:
      employerRate === null
        ? null
        : Math.round(gross * (1 + employerRate / 10000)),
    unknownEmployees: [...unknown],
    anomalies,
    rulesConfirmed: settings.rules_confirmed,
  };
}

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const currentMonth = () => parisDay(new Date()).slice(0, 7);

export async function hrState(
  db: DB,
  r: string,
  user: Actor,
  month = currentMonth(),
) {
  monthSchema.parse(month);
  const { scoped, payroll, attendance } = await teamAccess(db, r, user);
  const payrollEntitled = (await one<{installed:boolean}>(db,
    "SELECT app.addon_installed($1,'payroll') AS installed",[r])).installed;
  const variables = await variablesFor(db, r, month);
  const canPay = payroll && payrollEntitled;
  const absences = await rows(
    db,
    `SELECT a.id,a.profile_id,p.name,a.kind,a.starts_on::text,a.ends_on::text,a.status
       FROM hr_absences a JOIN profiles p ON p.id=a.profile_id
      WHERE a.restaurant_id=$1 AND a.ends_on>=$2::date-60 ORDER BY a.starts_on DESC LIMIT 100`,
    [r, variables.from],
  );
  const team = await rows<{ id: string; name: string }>(
    db,
    "SELECT DISTINCT p.id,p.name FROM profiles p JOIN memberships m ON m.profile_id=p.id WHERE m.restaurant_id=$1 ORDER BY p.name",
    [r],
  );
  const entries = await rows(
    db,
    `SELECT t.id,t.profile_id,p.name,t.event,t.created_at,t.source,t.reason
       FROM time_entries t JOIN profiles p ON p.id=t.profile_id
      WHERE t.restaurant_id=$1 AND t.voided_at IS NULL
        AND (t.created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date
      ORDER BY t.created_at DESC LIMIT 200`,
    [r, variables.from, variables.to],
  );
  return {
    month,
    entries,
    canPay,
    canManage: attendance && can(scoped.roles ?? scoped.role, "team"),
    team,
    variables,
    absences,
    settings: await settingsOf(db, r),
    contracts: canPay
      ? await rows(
          db,
          `SELECT c.id,c.profile_id,p.name,c.kind,c.weekly_minutes,c.hourly_rate,c.starts_on::text,c.ends_on::text
             FROM hr_contracts c JOIN profiles p ON p.id=c.profile_id
            WHERE c.restaurant_id=$1 ORDER BY p.name,c.starts_on DESC`,
          [r],
        )
      : [],
    cost: canPay ? await staffCost(db, r, variables.from, variables.to) : null,
    period: canPay
      ? ((
          await rows(
            db,
            "SELECT status,closed_at,reopen_reason FROM hr_payroll_periods WHERE restaurant_id=$1 AND month=$2",
            [r, month],
          )
        )[0] ?? null)
      : null,
  };
}

const id = z.string().min(1).max(100);
const date = z.iso.date();
const minutes = z.number().int().min(0).max(4800);
const rate = z.number().int().min(0).max(100000);
export const hrActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("correct"),
    profile: id,
    event: z.enum(["start", "break", "resume", "end"]),
    at: z.iso.datetime(),
    reason: z.string().trim().min(10).max(200),
  }),
  z.object({
    action: z.literal("void"),
    entry: id,
    reason: z.string().trim().min(10).max(200),
  }),
  z.object({
    action: z.literal("absence"),
    profile: id,
    kind: z.enum(["paid_leave", "sick", "unpaid", "family", "other"]),
    from: date,
    to: date,
    status: z.enum(["requested", "approved"]),
  }),
  z.object({
    action: z.literal("absenceStatus"),
    id,
    status: z.enum(["approved", "rejected", "cancelled"]),
  }),
  z.object({
    action: z.literal("contract"),
    profile: id,
    kind: z.enum(["cdi", "cdd", "extra", "apprentice", "other"]),
    weeklyMinutes: minutes,
    hourlyRate: rate,
    from: date,
    to: date.nullable(),
  }),
  z.object({
    action: z.literal("rules"),
    baseMinutes: minutes,
    band1Until: minutes,
    band2Until: minutes,
    band1RateBp: z.number().int().min(0).max(20000),
    band2RateBp: z.number().int().min(0).max(20000),
    band3RateBp: z.number().int().min(0).max(20000),
    employerRateBp: z.number().int().min(0).max(20000).nullable(),
    confirmed: z.boolean(),
  }),
  z.object({ action: z.literal("close"), month: monthSchema }),
  z.object({
    action: z.literal("reopen"),
    month: monthSchema,
    reason: z.string().trim().min(10).max(200),
  }),
]);

const member = (db: DB, r: string, profile: string) =>
  one(
    db,
    "SELECT profile_id FROM memberships WHERE restaurant_id=$1 AND profile_id=$2 LIMIT 1",
    [r, profile],
  );
/** Un mois clôturé ne bouge plus : il faut le rouvrir, ce qui est tracé. */
async function assertOpen(db: DB, r: string, day: string) {
  const closed = await rows(
    db,
    "SELECT month FROM hr_payroll_periods WHERE restaurant_id=$1 AND month=$2 AND status='closed'",
    [r, day.slice(0, 7)],
  );
  if (closed.length)
    throw new Error(
      `Le mois ${day.slice(0, 7)} est clôturé : rouvrez-le d’abord.`,
    );
}

export async function hrAction(
  db: DB,
  r: string,
  rawUser: Actor,
  a: z.infer<typeof hrActionSchema>,
) {
  const { scoped: user, attendance } = await teamAccess(db, r, rawUser);
  const manage = () => {
    if (!attendance) throw new Error("L’add-on Présences n’est pas actif pour cet établissement.");
    requirePermission(user.roles ?? user.role, "team");
  };
  switch (a.action) {
    case "correct": {
      manage();
      await member(db, r, a.profile);
      if (Date.parse(a.at) > Date.now())
        throw new Error("Une correction ne peut pas être dans le futur.");
      await assertOpen(db, r, parisDay(a.at));
      const entry = randomUUID();
      await db.query(
        "INSERT INTO time_entries(id,restaurant_id,profile_id,event,created_at,source,corrected_by,reason) VALUES($1,$2,$3,$4,$5,'correction',$6,$7)",
        [entry, r, a.profile, a.event, a.at, user.id, a.reason],
      );
      await log(db, r, user.id, "Pointage corrigé", entry);
      return { id: entry };
    }
    case "void": {
      manage();
      const entry = await one<{ created_at: string; voided_at: string | null }>(
        db,
        "SELECT created_at::text,voided_at FROM time_entries WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [a.entry, r],
      );
      if (entry.voided_at) throw new Error("Ce pointage est déjà annulé.");
      await assertOpen(db, r, parisDay(entry.created_at));
      await db.query(
        "UPDATE time_entries SET voided_at=now(),voided_by=$2,void_reason=$3 WHERE id=$1",
        [a.entry, user.id, a.reason],
      );
      await log(db, r, user.id, "Pointage annulé", a.entry);
      return {};
    }
    case "absence": {
      manage();
      await member(db, r, a.profile);
      if (a.to < a.from) throw new Error("Période d’absence invalide.");
      await assertOpen(db, r, a.from);
      await assertOpen(db, r, a.to);
      const overlap = await rows(
        db,
        "SELECT id FROM hr_absences WHERE restaurant_id=$1 AND profile_id=$2 AND status IN ('requested','approved') AND starts_on<=$4::date AND ends_on>=$3::date",
        [r, a.profile, a.from, a.to],
      );
      if (overlap.length)
        throw new Error("Une absence existe déjà sur cette période.");
      const absence = randomUUID();
      await db.query(
        "INSERT INTO hr_absences(id,restaurant_id,profile_id,kind,starts_on,ends_on,status,created_by,decided_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          absence,
          r,
          a.profile,
          a.kind,
          a.from,
          a.to,
          a.status,
          user.id,
          a.status === "approved" ? user.id : null,
        ],
      );
      // Le motif reste hors du journal : une absence peut révéler une donnée de santé.
      await log(db, r, user.id, "Absence enregistrée", absence);
      return { id: absence };
    }
    case "absenceStatus": {
      manage();
      const absence = await one<{ starts_on: string; ends_on: string }>(
        db,
        "SELECT starts_on::text,ends_on::text FROM hr_absences WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [a.id, r],
      );
      await assertOpen(db, r, absence.starts_on);
      await assertOpen(db, r, absence.ends_on);
      await db.query(
        "UPDATE hr_absences SET status=$2,decided_by=$3 WHERE id=$1",
        [a.id, a.status, user.id],
      );
      await log(db, r, user.id, "Absence mise à jour", a.id);
      return {};
    }
    case "contract": {
      const payroll = await payrollAccess(db, r, rawUser);
      await member(db, r, a.profile);
      if (a.to && a.to < a.from) throw new Error("Dates de contrat invalides.");
      // Un seul taux à une date donnée : le précédent se termine la veille.
      const previous = await rows<{ id: string; starts_on: string }>(
        db,
        "SELECT id,starts_on::text FROM hr_contracts WHERE restaurant_id=$1 AND profile_id=$2 AND (ends_on IS NULL OR ends_on>=$3::date) AND starts_on<=coalesce($4::date,'9999-12-31'::date) FOR UPDATE",
        [r, a.profile, a.from, a.to],
      );
      if (previous.some((c) => c.starts_on >= a.from))
        throw new Error("Un contrat débute déjà à cette date ou après.");
      for (const c of previous)
        await db.query(
          "UPDATE hr_contracts SET ends_on=$2::date-1 WHERE id=$1",
          [c.id, a.from],
        );
      const contract = randomUUID();
      await db.query(
        "INSERT INTO hr_contracts(id,restaurant_id,profile_id,kind,weekly_minutes,hourly_rate,starts_on,ends_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          contract,
          r,
          a.profile,
          a.kind,
          a.weeklyMinutes,
          a.hourlyRate,
          a.from,
          a.to,
          payroll.id,
        ],
      );
      // Le montant reste hors du journal, visible par d’autres rôles.
      await log(db, r, payroll.id, "Contrat enregistré", contract);
      return { id: contract };
    }
    case "rules": {
      const payroll = await payrollAccess(db, r, rawUser);
      if (!(a.baseMinutes < a.band1Until && a.band1Until < a.band2Until))
        throw new Error("Les seuils doivent être croissants.");
      await settingsOf(db, r);
      await db.query(
        "UPDATE hr_settings SET base_minutes=$2,band1_until=$3,band2_until=$4,band1_rate_bp=$5,band2_rate_bp=$6,band3_rate_bp=$7,employer_rate_bp=$8,rules_confirmed=$9,updated_by=$10,updated_at=now() WHERE restaurant_id=$1",
        [
          r,
          a.baseMinutes,
          a.band1Until,
          a.band2Until,
          a.band1RateBp,
          a.band2RateBp,
          a.band3RateBp,
          a.employerRateBp,
          a.confirmed,
          payroll.id,
        ],
      );
      await log(
        db,
        r,
        payroll.id,
        "Règles d’heures supplémentaires mises à jour",
      );
      return {};
    }
    case "close": {
      const payroll = await payrollAccess(db, r, rawUser);
      const variables = await variablesFor(db, r, a.month);
      if (!variables.rulesConfirmed)
        throw new Error(
          "Confirmez d’abord les règles d’heures supplémentaires.",
        );
      const blocking = variables.employees.filter((e) =>
        e.anomalies.some((x) => x.kind !== "long_day"),
      );
      if (blocking.length)
        throw new Error(
          `Pointages à corriger avant clôture : ${blocking.map((e) => e.name).join(", ")}.`,
        );
      const prior = await rows<{ status: string }>(
        db,
        "SELECT status FROM hr_payroll_periods WHERE restaurant_id=$1 AND month=$2 FOR UPDATE",
        [r, a.month],
      );
      if (prior[0]?.status === "closed")
        throw new Error("Ce mois est déjà clôturé.");
      await db.query(
        `INSERT INTO hr_payroll_periods(id,restaurant_id,month,status,variables,closed_by) VALUES($1,$2,$3,'closed',$4,$5)
         ON CONFLICT(restaurant_id,month) DO UPDATE SET status='closed',variables=excluded.variables,closed_by=excluded.closed_by,closed_at=now()`,
        [randomUUID(), r, a.month, JSON.stringify(variables), payroll.id],
      );
      await log(db, r, payroll.id, `Variables de paie clôturées : ${a.month}`);
      return {};
    }
    case "reopen": {
      const payroll = await payrollAccess(db, r, rawUser);
      const changed = await db.query(
        "UPDATE hr_payroll_periods SET status='reopened',reopened_by=$3,reopen_reason=$4 WHERE restaurant_id=$1 AND month=$2 AND status='closed'",
        [r, a.month, payroll.id, a.reason],
      );
      if (!changed.affectedRows) throw new Error("Ce mois n’est pas clôturé.");
      await log(db, r, payroll.id, `Variables de paie rouvertes : ${a.month}`);
      return {};
    }
  }
}

const cell = (value: unknown) => {
  let s = String(value ?? "");
  // Un nom commençant par « = » ne doit pas devenir une formule dans un tableur.
  if (typeof value === "string" && /^[=+@\-\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};
const hours = (m: number) => (m / 60).toFixed(2).replace(".", ",");

/** Export pour le gestionnaire de paie. Refusé tant que le mois n’est pas clôturé. */
export async function payrollExport(
  db: DB,
  r: string,
  user: Actor,
  month: string,
) {
  monthSchema.parse(month);
  const payroll = await payrollAccess(db, r, user);
  const period = (
    await rows<{ status: string; variables: MonthVariables }>(
      db,
      "SELECT status,variables FROM hr_payroll_periods WHERE restaurant_id=$1 AND month=$2",
      [r, month],
    )
  )[0];
  if (period?.status !== "closed")
    throw new Error("Clôturez le mois avant d’exporter ses variables.");
  const kinds = Object.keys(absenceLabels);
  const header = [
    "mois",
    "collaborateur",
    "heures_travaillees",
    "heures_complementaires",
    "heures_sup_tranche_1",
    "heures_sup_tranche_2",
    "heures_sup_tranche_3",
    ...kinds.map((k) => `jours_${k}`),
    "a_verifier",
  ];
  const lines = period.variables.employees.map((e) =>
    [
      cell(month),
      cell(e.name),
      cell(hours(e.workedMinutes)),
      cell(hours(e.complementary)),
      cell(hours(e.band1)),
      cell(hours(e.band2)),
      cell(hours(e.band3)),
      ...kinds.map((k) => cell(e.absenceDays[k] ?? 0)),
      cell(e.anomalies.map((x) => `${x.day} : ${x.message}`).join(" | ")),
    ].join(";"),
  );
  await log(db, r, payroll.id, `Variables de paie exportées : ${month}`);
  return `﻿${[header.map(cell).join(";"), ...lines].join("\r\n")}`;
}
