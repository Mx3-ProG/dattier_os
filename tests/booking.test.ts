import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one } from "../src/lib/database/db";
import { perform, actionSchema } from "../src/lib/actions";
import {
  availability,
  booking,
  calendar,
  parisDate,
  parisToUtc,
  requestReservation,
  reservationSchema,
} from "../src/features/reservations/service";
import type { Actor } from "../src/lib/auth/session";
let db: PGlite;
const owner: Actor = { id: "nadia", name: "Nadia", role: "OWNER" },
  bar: Actor = { id: "youssef", name: "Youssef", role: "BARTENDER" },
  chef: Actor = { id: "karim", name: "Karim", role: "CHEF" };
const act = (user: Actor, input: unknown) =>
  db.transaction((tx) =>
    perform(tx, "bernay", user, actionSchema.parse(input)),
  );
const openDay = (ahead: number) => {
  for (let n = ahead; ; n++) {
    const d = parisDate(Date.now() + n * 86400000);
    if (
      !booking.closedWeekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())
    )
      return d;
  }
};
const request = (date: string, time: string, extra: object = {}) =>
  db.transaction((tx) =>
    requestReservation(
      tx,
      reservationSchema.parse({
        restaurant: "bernay",
        name: "Test fictif",
        contact: "test@example.test",
        guests: 2,
        start: new Date(parisToUtc(date, time)).toISOString(),
        ...extra,
      }),
    ),
  );
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(() => db.close());

test("heure de Paris : conversion été/hiver", () => {
  assert.equal(
    new Date(parisToUtc("2026-07-14", "19:30")).toISOString(),
    "2026-07-14T17:30:00.000Z",
  );
  assert.equal(
    new Date(parisToUtc("2026-12-18", "19:30")).toISOString(),
    "2026-12-18T18:30:00.000Z",
  );
});

test("calendrier : jours fermés, passés et ouverts", async () => {
  const month = openDay(7).slice(0, 7);
  const c = await calendar(db, "bernay", { month, guests: 2 });
  assert.ok(c.days.length >= 28);
  for (const d of c.days) {
    const day = new Date(`${d.date}T12:00:00Z`).getUTCDay();
    if (d.status !== "past")
      assert.equal(d.status === "closed", booking.closedWeekdays.includes(day));
  }
  assert.ok(c.days.some((d) => d.status === "available"));
  assert.equal(c.largest, 6);
});

test("disponibilités : table prise, trop petite et réservée en ligne", async () => {
  const date = openDay(3);
  let day = await availability(db, "bernay", { date, guests: 4 });
  const slot = day.services[1].slots.find((s) => s.time === "20:00")!;
  // Les tables de 2 places ne conviennent pas à 4 personnes.
  assert.ok(!slot.free.includes("bernay-t1"));
  assert.ok(slot.free.includes("bernay-t4"));
  const id = await request(date, "20:00", { guests: 4, table: "bernay-t4" });
  day = await availability(db, "bernay", { date, guests: 4 });
  for (const time of ["18:30", "19:00", "20:00", "21:30"].filter((t) =>
    day.services[1].slots.some((s) => s.time === t),
  )) {
    const s = day.services[1].slots.find((x) => x.time === time)!;
    // Durée de 2 h : 19:00 et 21:30 chevauchent 20:00–22:00.
    assert.equal(s.free.includes("bernay-t4"), false, time);
  }
  assert.ok(
    day.services[0].slots[0].free.includes("bernay-t4"),
    "le midi reste libre",
  );
  const r = await one<{ table_id: string; status: string }>(
    db,
    "SELECT table_id,status FROM reservations WHERE id=$1",
    [id],
  );
  assert.deepEqual(r, { table_id: "bernay-t4", status: "requested" });
  await assert.rejects(
    request(date, "21:00", { guests: 2, table: "bernay-t4" }),
    /vient d’être réservée/,
  );
  await assert.rejects(
    request(date, "20:00", { guests: 4, table: "bernay-t1" }),
    /trop petite/,
  );
});

test("créneaux hors service ou jour fermé refusés, groupe sans table accepté", async () => {
  const date = openDay(4);
  await assert.rejects(request(date, "16:00"), /pas ouvert/);
  await assert.rejects(request(date, "19:15"), /pas ouvert/);
  const closed = (() => {
    for (let n = 2; ; n++) {
      const d = parisDate(Date.now() + n * 86400000);
      if (
        booking.closedWeekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())
      )
        return d;
    }
  })();
  await assert.rejects(request(closed, "19:30"), /pas ouvert/);
  assert.ok(await request(date, "19:30", { guests: 14 }));
});

test("plan de salle : ajout, modification, déplacement, archivage, suppression", async () => {
  await assert.rejects(
    act(chef, {
      action: "saveTable",
      number: 20,
      capacity: 4,
      zone: "Salle principale",
      shape: "square",
      bookable: true,
    }),
    /refusé/,
  );
  const id = (await act(bar, {
    action: "saveTable",
    number: 20,
    capacity: 8,
    zone: "Mezzanine",
    label: "Grande table",
    shape: "rect",
    bookable: true,
  })) as unknown as string;
  await assert.rejects(
    act(owner, {
      action: "saveTable",
      number: 20,
      capacity: 2,
      zone: "Salle",
      shape: "round",
      bookable: true,
    }),
    /déjà utilisé/,
  );
  await act(owner, { action: "moveTable", id, x: 70, y: 40 });
  const date = openDay(5);
  const day = await availability(db, "bernay", { date, guests: 8 });
  assert.deepEqual(day.services[1].slots[0].free, [id]);
  await request(date, "19:00", { guests: 8, table: id });
  await assert.rejects(
    act(owner, {
      action: "saveTable",
      id,
      number: 20,
      capacity: 6,
      zone: "Mezzanine",
      shape: "rect",
      bookable: true,
    }),
    /réaffectez/,
  );
  await assert.rejects(
    act(owner, { action: "tableLifecycle", id, operation: "archive" }),
    /réservation/,
  );
  await db.query(
    "UPDATE reservations SET status='cancelled' WHERE table_id=$1",
    [id],
  );
  await act(owner, { action: "tableLifecycle", id, operation: "archive" });
  assert.equal(
    (await availability(db, "bernay", { date, guests: 8 })).tables.some(
      (t) => t.id === id,
    ),
    false,
  );
  await assert.rejects(
    act(owner, { action: "tableLifecycle", id, operation: "delete" }),
    /archivez-la/,
  );
  await act(owner, { action: "tableLifecycle", id, operation: "restore" });
  const fresh = (await act(owner, {
    action: "saveTable",
    number: 21,
    capacity: 2,
    zone: "Terrasse",
    shape: "round",
    bookable: false,
  })) as unknown as string;
  assert.equal(
    (await availability(db, "bernay", { date, guests: 2 })).tables.some(
      (t) => t.id === fresh,
    ),
    false,
    "table non réservable en ligne masquée",
  );
  await act(owner, {
    action: "tableLifecycle",
    id: fresh,
    operation: "delete",
  });
  assert.equal(
    (await db.query("SELECT 1 FROM dining_tables WHERE id=$1", [fresh])).rows
      .length,
    0,
  );
});
