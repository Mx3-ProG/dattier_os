import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows } from "../src/lib/database/db";
import {
  ensureQr,
  qrAction,
  qrPortfolio,
  scanDestination,
  syncQrCodes,
} from "../src/features/qr/service";
import type { Actor } from "../src/lib/auth/session";

const owner: Actor = { id: "nadia", name: "Nadia", role: "OWNER", roles: ["OWNER"] };
const chef: Actor = { id: "karim", name: "Karim", role: "CHEF", roles: ["CHEF"] };
const R = "bernay";
let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(async () => {
  await db.close();
});

const active = (kind: string) =>
  rows<{ ref: string; token: string }>(
    db,
    "SELECT ref,token FROM qr_codes WHERE restaurant_id=$1 AND kind=$2 AND archived_at IS NULL",
    [R, kind],
  );

test("portefeuille : un QR par objet, régénéré quand la salle change", async () => {
  await db.transaction((tx) => syncQrCodes(tx, R));
  const tables = await rows<{ id: string }>(
    db,
    "SELECT id FROM dining_tables WHERE restaurant_id=$1 AND archived_at IS NULL",
    [R],
  );
  assert.equal((await active("table")).length, tables.length);
  assert.equal((await active("site")).length, 1);
  assert.equal((await active("clock")).length, 1);
  const before = new Map((await active("table")).map((q) => [q.ref, q.token]));

  // Sync is idempotent: same tokens, nothing duplicated.
  await db.transaction((tx) => syncQrCodes(tx, R));
  assert.deepEqual(
    new Map((await active("table")).map((q) => [q.ref, q.token])),
    before,
  );

  // A new table gets its code; a removed one loses it.
  await db.query(
    "INSERT INTO dining_tables(id,restaurant_id,number,capacity) VALUES('bernay-t99',$1,99,4)",
    [R],
  );
  await db.query("UPDATE dining_tables SET archived_at=now() WHERE id=$1", [tables[0].id]);
  await db.transaction((tx) => syncQrCodes(tx, R));
  const after = await active("table");
  assert.ok(after.some((q) => q.ref === "bernay-t99"));
  assert.ok(!after.some((q) => q.ref === tables[0].id));
  assert.equal(after.length, tables.length);

  // The table comes back with the same code (printed stickers stay valid).
  await db.query("UPDATE dining_tables SET archived_at=NULL WHERE id=$1", [tables[0].id]);
  await db.transaction((tx) => syncQrCodes(tx, R));
  assert.equal(
    (await active("table")).find((q) => q.ref === tables[0].id)?.token,
    before.get(tables[0].id),
  );
});

test("portefeuille : filtré selon les droits du membre", async () => {
  const all = await db.transaction((tx) => qrPortfolio(tx, R, owner));
  const kitchen = await db.transaction((tx) => qrPortfolio(tx, R, chef));
  assert.ok(all.codes.some((c) => c.kind === "supplier"));
  assert.ok(all.codes.some((c) => c.kind === "table"));
  assert.ok(!kitchen.codes.some((c) => c.kind === "promo" || c.kind === "supplier"));
  assert.ok(kitchen.codes.some((c) => c.kind === "clock"));
});

test("scan : traçage, équipe ou client, destinations", async () => {
  const table = (await active("table"))[0];
  const scan = (token: string, uid: string | null) =>
    one<{ restaurant_id: string; kind: string; ref: string; target: string | null; archived: boolean; staff: boolean }>(
      db,
      "SELECT * FROM app.scan_qr($1,$2)",
      [token, uid],
    );
  const asCustomer = await scan(table.token, null);
  const asStaff = await scan(table.token, "nadia");
  assert.equal(asCustomer.staff, false);
  assert.equal(asStaff.staff, true);
  assert.equal(
    (await rows(db, "SELECT * FROM app.scan_qr('zzzzzzzzzz',NULL)")).length,
    0,
  );
  const scans = await rows<{ audience: string }>(
    db,
    "SELECT audience FROM qr_scans s JOIN qr_codes q ON q.id=s.qr_id WHERE q.token=$1 ORDER BY audience",
    [table.token],
  );
  assert.deepEqual(scans.map((s) => s.audience), ["public", "staff"]);

  const target = { kind: "table" as const, ref: table.ref, target: null, restaurant: R };
  const number = (
    await one<{ number: number }>(db, "SELECT number FROM dining_tables WHERE id=$1", [table.ref])
  ).number;
  assert.equal(
    await scanDestination(db, target, false, table.token),
    `/r/bernay/commander?table=${number}`,
  );
  assert.equal(
    await scanDestination(db, target, true, table.token),
    `/dashboard?restaurant=bernay&module=dining&focus=${table.ref}`,
  );
  // Team-only code scanned by a customer: log in first.
  const supplier = (await active("supplier"))[0];
  assert.match(
    await scanDestination(db, { kind: "supplier", ref: supplier.ref, target: null, restaurant: R }, false, supplier.token),
    /^\/auth\/login\?returnTo=%2Fq%2F/,
  );
  const clock = (await active("clock"))[0];
  assert.equal(
    await scanDestination(db, { kind: "clock", ref: R, target: null, restaurant: R }, true, clock.token),
    "/pointage?restaurant=bernay",
  );
  const portfolio = await db.transaction((tx) => qrPortfolio(tx, R, owner));
  assert.equal(portfolio.codes.find((c) => c.token === table.token)?.scans, 2);
});

test("générateur : liens personnalisés et codes à la demande", async () => {
  const custom = (await db.transaction((tx) =>
    qrAction(tx, R, owner, { action: "custom", label: "Menu du midi", target: "/carte" }),
  )) as Awaited<ReturnType<typeof ensureQr>>;
  assert.equal(
    await scanDestination(db, { kind: "custom", ref: custom.ref, target: "/carte", restaurant: R }, false, custom.token),
    "/r/bernay/carte",
  );
  const archived = await db.transaction((tx) =>
    qrAction(tx, R, owner, { action: "archive", id: custom.id }),
  );
  assert.deepEqual(archived, { ok: true });
  const site = await one<{ id: string }>(
    db,
    "SELECT id FROM qr_codes WHERE restaurant_id=$1 AND kind='site'",
    [R],
  );
  await assert.rejects(
    db.transaction((tx) => qrAction(tx, R, owner, { action: "archive", id: site.id })),
    /personnalisés/,
  );
  const booking = await one<{ id: string }>(
    db,
    "SELECT id FROM reservations WHERE restaurant_id=$1 LIMIT 1",
    [R],
  );
  const first = (await db.transaction((tx) =>
    qrAction(tx, R, owner, { action: "ensure", kind: "reservation", ref: booking.id }),
  )) as Awaited<ReturnType<typeof ensureQr>>;
  const second = await db.transaction((tx) =>
    ensureQr(tx, R, "reservation", booking.id, "x"),
  );
  assert.equal(first.token, second.token);
  await assert.rejects(
    db.transaction((tx) =>
      qrAction(tx, R, chef, { action: "ensure", kind: "reservation", ref: booking.id }),
    ),
    /refusé/,
  );
});
