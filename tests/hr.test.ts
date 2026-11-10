import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { withDatabaseContext } from "../src/lib/database/context";
import { actionSchema, perform } from "../src/lib/actions";
import { can } from "../src/lib/permissions";
import { financeDashboard } from "../src/features/finance/dashboard";
import { financeReply } from "../src/features/assistant/finance";
import {
  consolidate,
  monthBounds,
  premium,
  splitWeek,
  weekEnd,
  weekStart,
  workingDays,
  type ClockEvent,
  type Rules,
} from "../src/features/hr/hours";
import {
  hrAction,
  hrActionSchema,
  hrState,
  payrollExport,
  staffCost,
} from "../src/features/hr/service";

const R = "bernay";
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
const manager = { id: "lina", name: "Lina", role: "MANAGER" as const };
let db: PGlite;
const rules: Rules = { baseMinutes: 2100, band1Until: 2340, band2Until: 2580, band1RateBp: 1000, band2RateBp: 2000, band3RateBp: 5000 };
const ev = (event: ClockEvent["event"], at: string): ClockEvent => ({ id: randomUUID(), profileId: "p", event, at });
const later = new Date("2030-01-01T00:00:00Z");

const asApp = <T>(userId: string, fn: (tx: DB) => Promise<T>, isPublic = false) =>
  withDatabaseContext({ userId, restaurantId: R, public: isPublic }, () =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true)",
        [userId, R, String(isPublic)],
      );
      return fn(tx);
    }),
  ) as Promise<T>;
const act = async (a: Parameters<typeof hrAction>[3], user: Parameters<typeof hrAction>[2] = owner) => {
  const parsed = hrActionSchema.parse(a);
  return asApp(user.id, (tx) => hrAction(tx, R, user, parsed));
};
const clock = (profile: string, event: string, at: string) =>
  db.query("INSERT INTO time_entries(id,restaurant_id,profile_id,event,created_at) VALUES($1,$2,$3,$4,$5)", [randomUUID(), R, profile, event, at]);
const employee = async (month: string, profile: string) =>
  (await asApp("nadia", (tx) => hrState(tx, R, owner, month))).variables.employees.find((e) => e.profileId === profile);

before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  // Mois de test sans historique : les données de démonstration sont récentes.
  await db.query("INSERT INTO memberships(profile_id,restaurant_id,role) VALUES('lina',$1,'MANAGER') ON CONFLICT DO NOTHING", [R]);
});
after(() => db.close());

test("droits : la paie est réservée, le manager garde l’équipe mais pas les salaires", () => {
  assert.equal(can("OWNER", "payroll"), true);
  assert.equal(can("ACCOUNTANT", "payroll"), true);
  assert.equal(can("MANAGER", "payroll"), false);
  assert.equal(can("MANAGER", "team"), true);
  assert.equal(can("WAITER", "payroll"), false);
});

test("consolidation : les pauses ne comptent pas, le jour de prise de poste fait foi", () => {
  const { days, anomalies } = consolidate(
    [
      ev("start", "2026-03-02T09:00:00Z"),
      ev("break", "2026-03-02T12:00:00Z"),
      ev("resume", "2026-03-02T13:00:00Z"),
      ev("end", "2026-03-02T17:30:00Z"),
      // Service de nuit : compté le jour où il commence, à l’heure de Paris.
      ev("start", "2026-03-03T19:00:00Z"),
      ev("end", "2026-03-04T01:00:00Z"),
    ],
    later,
  );
  assert.equal(days.get("2026-03-02"), 7.5 * 60);
  assert.equal(days.get("2026-03-03"), 6 * 60);
  assert.equal(days.has("2026-03-04"), false);
  assert.deepEqual(anomalies, []);
});

test("consolidation : une sortie oubliée n’est jamais estimée", () => {
  const forgotten = consolidate([ev("start", "2026-03-02T09:00:00Z"), ev("start", "2026-03-03T09:00:00Z"), ev("end", "2026-03-03T12:00:00Z")], later);
  assert.equal(forgotten.days.get("2026-03-02"), undefined);
  assert.equal(forgotten.days.get("2026-03-03"), 180);
  assert.equal(forgotten.anomalies[0].kind, "missing_end");
  assert.equal(forgotten.anomalies[0].day, "2026-03-02");
  // Heures déjà effectuées avant la pause conservées, le reste signalé.
  const paused = consolidate([ev("start", "2026-03-02T09:00:00Z"), ev("break", "2026-03-02T11:00:00Z")], later);
  assert.equal(paused.days.get("2026-03-02"), 120);
  assert.equal(paused.anomalies[0].kind, "missing_end");
  // Service en cours : ni compté, ni signalé.
  const now = new Date("2026-03-02T12:00:00Z");
  const running = consolidate([ev("start", "2026-03-02T09:00:00Z")], now);
  assert.equal(running.days.size, 0);
  assert.deepEqual(running.anomalies, []);
  assert.equal(consolidate([ev("end", "2026-03-02T09:00:00Z")], later).anomalies[0].kind, "bad_sequence");
  assert.equal(consolidate([ev("start", "2026-03-02T06:00:00Z"), ev("end", "2026-03-02T20:00:00Z")], later).anomalies[0].kind, "long_day");
});

test("heures supplémentaires : tranches, majoration et temps partiel", () => {
  assert.deepEqual(splitWeek(46 * 60, 39 * 60, rules), { minutes: 2760, complementary: 0, band1: 240, band2: 240, band3: 180 });
  assert.deepEqual(splitWeek(35 * 60, 35 * 60, rules), { minutes: 2100, complementary: 0, band1: 0, band2: 0, band3: 0 });
  assert.equal(splitWeek(30 * 60, 24 * 60, rules).complementary, 360);
  assert.equal(splitWeek(30 * 60, null, rules).complementary, 0, "sans contrat, rien n’est supposé");
  // 4 h à 10 % de 12 € = 4,80 € ; 4 h à 20 % = 9,60 € ; 3 h à 50 % = 18 €.
  assert.equal(Math.round(premium(splitWeek(46 * 60, 39 * 60, rules), 1200, rules)), 3240);
  assert.equal(weekStart("2026-03-04"), "2026-03-02");
  assert.equal(weekEnd("2026-03-04"), "2026-03-08");
  assert.equal(workingDays("2026-03-02", "2026-03-08", "2026-03-01", "2026-03-31"), 6, "dimanche exclu");
  assert.equal(workingDays("2026-02-27", "2026-03-03", "2026-03-01", "2026-03-31"), 2, "limité au mois");
  assert.deepEqual(monthBounds("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
});

test("mois : semaine rattachée au mois de son dimanche, absences comptées", async () => {
  for (const day of ["02", "03", "04", "05", "06"]) {
    await clock("sarah", "start", `2026-03-${day}T07:00:00Z`);
    await clock("sarah", "end", `2026-03-${day}T16:00:00Z`);
  }
  // Semaine à cheval : son dimanche tombe en mars, elle appartient à mars.
  await clock("sarah", "start", "2026-02-27T07:00:00Z");
  await clock("sarah", "end", "2026-02-27T11:00:00Z");
  const march = await employee("2026-03", "sarah");
  assert.equal(march?.workedMinutes, 45 * 60);
  assert.deepEqual([march?.band1, march?.band2, march?.band3], [240, 240, 2 * 60]);
  const february = await employee("2026-02", "sarah");
  assert.equal(february?.workedMinutes, 4 * 60);
  assert.equal(february?.band1, 0);
  const created = (await act({ action: "absence", profile: "sarah", kind: "sick", from: "2026-03-16", to: "2026-03-22", status: "approved" })) as { id: string };
  assert.deepEqual((await employee("2026-03", "sarah"))?.absenceDays, { sick: 6 });
  await assert.rejects(act({ action: "absence", profile: "sarah", kind: "paid_leave", from: "2026-03-20", to: "2026-03-21", status: "approved" }), /existe déjà/);
  await act({ action: "absenceStatus", id: created.id, status: "cancelled" });
  assert.deepEqual((await employee("2026-03", "sarah"))?.absenceDays, {});
});

test("correction : sortie ajoutée et tracée, pointage annulé sans effacement, état de pointage juste", async () => {
  await clock("karim", "start", "2026-04-07T08:00:00Z");
  assert.equal((await employee("2026-04", "karim"))?.anomalies[0].kind, "missing_end");
  await assert.rejects(act({ action: "correct", profile: "karim", event: "end", at: "2026-04-07T16:00:00.000Z", reason: "court" }));
  await assert.rejects(act({ action: "correct", profile: "karim", event: "end", at: "2099-01-01T00:00:00.000Z", reason: "Dans le futur, refusé" }), /futur/);
  const fixed = (await act({ action: "correct", profile: "karim", event: "end", at: "2026-04-07T16:00:00.000Z", reason: "Oubli de pointage à la fermeture" })) as { id: string };
  const after = await employee("2026-04", "karim");
  assert.equal(after?.workedMinutes, 8 * 60);
  assert.deepEqual(after?.anomalies, []);
  const row = await one<{ source: string; corrected_by: string; reason: string }>(db, "SELECT source,corrected_by,reason FROM time_entries WHERE id=$1", [fixed.id]);
  assert.deepEqual([row.source, row.corrected_by], ["correction", "nadia"]);
  await act({ action: "void", entry: fixed.id, reason: "Correction saisie par erreur" });
  assert.equal((await employee("2026-04", "karim"))?.workedMinutes, 0);
  assert.equal((await one<{ count: number }>(db, "SELECT count(*)::int AS count FROM time_entries WHERE id=$1", [fixed.id])).count, 1, "conservé");
  await assert.rejects(act({ action: "void", entry: fixed.id, reason: "Deuxième annulation" }), /déjà annulé/);
  // Une correction remet le pointage du collaborateur dans le bon état.
  await act({ action: "correct", profile: "karim", event: "end", at: "2026-04-07T16:00:00.000Z", reason: "Sortie confirmée par le manager" });
  const karim = { id: "karim", name: "Karim", role: "CHEF" as const };
  await db.transaction((tx) => perform(tx, R, karim, actionSchema.parse({ action: "clock", event: "start" })));
});

test("créneau planifié sans pointage : signalé, sans heures inventées", async () => {
  await db.query("INSERT INTO shifts(id,restaurant_id,profile_id,starts_at,ends_at) VALUES($1,$2,'amine','2026-05-05T08:00:00Z','2026-05-05T16:00:00Z')", [randomUUID(), R]);
  const e = await employee("2026-05", "amine");
  assert.equal(e?.anomalies[0].kind, "no_clock");
  assert.equal(e?.workedMinutes, 0);
});

test("coût : aucun taux supposé, majorations incluses, charges facultatives", async () => {
  const before = await asApp("nadia", (tx) => staffCost(tx, R, "2026-03-01", "2026-03-31"));
  assert.equal(before.gross, 0);
  assert.ok(before.unknownEmployees.includes("Sarah") || before.unknownEmployees.length > 0);
  await act({ action: "contract", profile: "sarah", kind: "cdi", weeklyMinutes: 39 * 60, hourlyRate: 1200, from: "2026-01-01", to: null });
  const cost = await asApp("nadia", (tx) => staffCost(tx, R, "2026-03-01", "2026-03-31"));
  // 45 h × 12 € + (4 h×10 % + 4 h×20 % + 2 h×50 %) × 12 € ; la semaine de février ne compte que ses majorations.
  assert.equal(cost.gross, 45 * 1200 + 480 + 960 + 1200);
  assert.equal(cost.loaded, null);
  await act({ action: "rules", baseMinutes: 2100, band1Until: 2340, band2Until: 2580, band1RateBp: 1000, band2RateBp: 2000, band3RateBp: 5000, employerRateBp: 4000, confirmed: false });
  const loaded = await asApp("nadia", (tx) => staffCost(tx, R, "2026-03-01", "2026-03-31"));
  assert.equal(loaded.loaded, Math.round(cost.gross * 1.4));
  await assert.rejects(act({ action: "contract", profile: "sarah", kind: "cdi", weeklyMinutes: 35 * 60, hourlyRate: 1300, from: "2025-06-01", to: null }), /débute déjà/);
  await act({ action: "contract", profile: "sarah", kind: "cdi", weeklyMinutes: 35 * 60, hourlyRate: 1300, from: "2026-03-09", to: null });
  const previous = await rows<{ ends_on: string | null }>(db, "SELECT ends_on::text FROM hr_contracts WHERE profile_id='sarah' ORDER BY starts_on");
  assert.deepEqual(previous.map((c) => c.ends_on), ["2026-03-08", null]);
});

test("clôture : règles et pointages exigés, variables figées, export protégé", async () => {
  const month = "2026-03";
  await assert.rejects(act({ action: "close", month }), /règles/);
  await assert.rejects(asApp("nadia", (tx) => payrollExport(tx, R, owner, month)), /Clôturez/);
  const set = (confirmed: boolean) => act({ action: "rules", baseMinutes: 2100, band1Until: 2340, band2Until: 2580, band1RateBp: 1000, band2RateBp: 2000, band3RateBp: 5000, employerRateBp: 4000, confirmed });
  await set(true);
  await clock("youssef", "start", "2026-03-10T08:00:00Z");
  await assert.rejects(act({ action: "close", month }), /Youssef/);
  await act({ action: "correct", profile: "youssef", event: "end", at: "2026-03-10T12:00:00.000Z", reason: "Sortie confirmée sur le planning" });
  await act({ action: "close", month });
  await assert.rejects(act({ action: "close", month }), /déjà clôturé/);
  // Le mois figé refuse toute modification jusqu’à sa réouverture.
  await assert.rejects(act({ action: "correct", profile: "sarah", event: "start", at: "2026-03-20T08:00:00.000Z", reason: "Modification après clôture" }), /clôturé/);
  await assert.rejects(act({ action: "absence", profile: "sarah", kind: "other", from: "2026-03-25", to: "2026-03-26", status: "approved" }), /clôturé/);
  const csv = await asApp("nadia", (tx) => payrollExport(tx, R, owner, month));
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.split("\r\n");
  assert.match(lines[0], /heures_sup_tranche_1/);
  const line = lines.find((l) => l.includes('"Sarah"'))!;
  assert.match(line, /"45,00"/);
  assert.match(line, /"4,00";"4,00";"2,00"/);
  assert.doesNotMatch(csv, /1200|hourly/, "aucun taux dans l’export");
  await assert.rejects(act({ action: "reopen", month: "2026-07", reason: "Mois jamais clôturé" }), /pas clôturé/);
  await act({ action: "reopen", month, reason: "Correction demandée par le gestionnaire" });
  await assert.rejects(asApp("nadia", (tx) => payrollExport(tx, R, owner, month)), /Clôturez/);
  await act({ action: "close", month });
});

test("export : un nom ne devient pas une formule de tableur", async () => {
  await db.query("INSERT INTO profiles(id,name,role,email) VALUES('hr-x','=HYPERLINK(1)','WAITER','x@example.test')");
  await db.query("INSERT INTO memberships(profile_id,restaurant_id,role) VALUES('hr-x',$1,'WAITER')", [R]);
  await clock("hr-x", "start", "2026-06-02T08:00:00Z");
  await clock("hr-x", "end", "2026-06-02T12:00:00Z");
  await act({ action: "close", month: "2026-06" }).catch(() => undefined);
  const period = await rows(db, "SELECT month FROM hr_payroll_periods WHERE month='2026-06'");
  if (period.length) {
    const csv = await asApp("nadia", (tx) => payrollExport(tx, R, owner, "2026-06"));
    assert.ok(csv.includes(`"'=HYPERLINK(1)"`));
  } else assert.fail("clôture de juin attendue");
});

test("tableau de bord et assistant : coût estimé, résultat prévisionnel distinct du comptable", async () => {
  const d = await asApp("nadia", (tx) => financeDashboard(tx, R, owner, { period: "custom", from: "2026-03-01", to: "2026-03-31" }));
  assert.ok(d.metrics.staffCost.value! > 0);
  assert.ok(["estimate", "partial"].includes(d.metrics.staffCost.status));
  assert.match(d.metrics.staffCost.note, /charges patronales estimées/);
  assert.equal(d.metrics.accountingResult.value, null);
  assert.match(financeReply("staff", d), /Coût de personnel sur la période/);
});

test("droits : rémunérations cachées au manager, tout caché à la salle et au public", async () => {
  await db.query("INSERT INTO memberships(profile_id,restaurant_id,role) VALUES('lina',$1,'MANAGER') ON CONFLICT DO NOTHING", [R]);
  const view = await asApp("lina", (tx) => hrState(tx, R, manager, "2026-03"));
  assert.equal(view.canPay, false);
  assert.deepEqual(view.contracts, []);
  assert.equal(view.cost, null);
  assert.ok(view.variables.employees.length > 0, "le manager voit les heures");
  assert.equal((await asApp("lina", (tx) => rows(tx, "SELECT * FROM hr_contracts"))).length, 0);
  assert.equal((await asApp("lina", (tx) => rows(tx, "SELECT * FROM hr_payroll_periods"))).length, 0);
  await assert.rejects(act({ action: "contract", profile: "sarah", kind: "cdi", weeklyMinutes: 2100, hourlyRate: 9000, from: "2027-01-01", to: null }, manager), /refusé/);
  await assert.rejects(asApp("lina", (tx) => payrollExport(tx, R, manager, "2026-03")), /refusé/);
  await assert.rejects(asApp("sarah", (tx) => hrState(tx, R, waiter, "2026-03")), /refusé/);
  await assert.rejects(act({ action: "correct", profile: "sarah", event: "end", at: "2026-04-01T10:00:00.000Z", reason: "Se corriger soi-même" }, waiter), /refusé/);
  for (const table of ["hr_contracts", "hr_absences", "hr_payroll_periods"]) {
    assert.equal((await asApp("sarah", (tx) => rows(tx, `SELECT * FROM ${table}`))).length, 0, table);
    assert.equal((await asApp("", (tx) => rows(tx, `SELECT * FROM ${table}`), true)).length, 0, table);
  }
  await assert.rejects(asApp("nadia", (tx) => tx.query("INSERT INTO hr_contracts(id,restaurant_id,profile_id,kind,weekly_minutes,hourly_rate,starts_on) VALUES('x','atelier','sarah','cdi',1,1,now()::date)")));
});

test("migration : descente refusée avec des données RH, puis cycle complet à vide", async () => {
  await assert.rejects(db.exec(await readFile("database/migrations/down/040_hr_payroll.sql", "utf8")), /Retour arrière refusé/);
  const scratch = new PGlite();
  try {
    await scratch.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(scratch);
    await scratch.exec(
      await readFile("database/migrations/down/041_sales_invoices.sql", "utf8"),
    );
    await scratch.exec(await readFile("database/migrations/down/040_hr_payroll.sql", "utf8"));
    assert.equal((await scratch.query<{ t: string | null }>("SELECT to_regclass('public.hr_contracts')::text AS t")).rows[0].t, null);
    await migrate(scratch);
    assert.equal((await scratch.query<{ t: string | null }>("SELECT to_regclass('public.hr_contracts')::text AS t")).rows[0].t, "hr_contracts");
  } finally {
    await scratch.close();
  }
});
