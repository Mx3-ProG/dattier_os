import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { perform, actionSchema } from "../src/application/actions";
import {
  availability,
  booking,
  parisDate,
  parisToUtc,
  requestReservation,
  reservationSchema,
  serviceSlots,
} from "../src/features/reservations/service";
import type { Actor } from "../src/infrastructure/auth/session";

const owner: Actor = { id: "nadia", name: "Nadia", role: "OWNER" };
const openDay = (ahead: number) => {
  for (let n = ahead; ; n++) {
    const d = parisDate(Date.now() + n * 86400000);
    if (!booking.closedWeekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return d;
  }
};

test("a business without the floor plan takes and confirms bookings without tables", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    // Plan de salle retiré, réservations conservées (état refusé avant la migration 100).
    await db.query("INSERT INTO addon_installations(restaurant_id,addon_id,installed) VALUES('bernay','floor',false)");
    const date = openDay(5);
    const time = serviceSlots()[0].times[0];
    const start = new Date(parisToUtc(date, time)).toISOString();
    const request = (extra: object = {}) => db.transaction((tx) =>
      requestReservation(tx, reservationSchema.parse({
        restaurant: "bernay", name: "Test fictif", contact: "test@example.test", guests: 4, start, ...extra,
      })));

    // Vue publique : aucune table exposée, créneaux ouverts aux demandes.
    const day = await db.transaction((tx) => availability(tx, "bernay", { date, guests: 4 }));
    assert.deepEqual(day.tables, []);
    assert.deepEqual(day.zones, []);
    assert.equal(day.group, true);
    assert.ok(day.services.some((service) => service.slots.some((slot) => slot.bookable)));

    // Choisir une table est refusé ; une demande sans table est enregistrée.
    await assert.rejects(request({ table: "bernay-t1" }), /choix de table/);
    const id = await request();
    const created = (await db.query<{ table_id: string | null; status: string }>(
      "SELECT table_id,status FROM reservations WHERE id=$1", [id])).rows[0];
    assert.deepEqual(created, { table_id: null, status: "requested" });

    // L'équipe confirme puis enregistre l'arrivée, sans table.
    const act = (input: unknown) => db.transaction((tx) => perform(tx, "bernay", owner, actionSchema.parse(input)));
    await assert.rejects(act({ action: "reservation", id, status: "confirmed", table: "bernay-t1" }), /plan de salle/);
    await act({ action: "reservation", id, status: "confirmed" });
    await act({ action: "reservation", id, status: "arrived" });
    const done = (await db.query<{ table_id: string | null; status: string }>(
      "SELECT table_id,status FROM reservations WHERE id=$1", [id])).rows[0];
    assert.deepEqual(done, { table_id: null, status: "arrived" });
  } finally {
    await db.close();
  }
});

test("with the floor plan, confirming a booking still requires a table", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const date = openDay(5);
    const start = new Date(parisToUtc(date, serviceSlots()[0].times[0])).toISOString();
    const id = await db.transaction((tx) => requestReservation(tx, reservationSchema.parse({
      restaurant: "bernay", name: "Test fictif", contact: "test@example.test", guests: 2, start,
    })));
    await assert.rejects(
      db.transaction((tx) => perform(tx, "bernay", owner, actionSchema.parse({ action: "reservation", id, status: "confirmed" }))),
      /Affectez une table/,
    );
  } finally {
    await db.close();
  }
});
