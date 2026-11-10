import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Actor } from "../src/lib/auth/session";
import { emit } from "../src/features/events/service";
import { listHistory } from "../src/features/events/history";
import {
  listNotifications,
  markRead,
  preferences,
  sweep,
} from "../src/features/notifications/service";

// En production `npm run db:migrate` est manuel : avant la migration 161, le
// code déployé doit garder le comportement d'origine au lieu d'échouer.
test("avant la migration 161 : notifications d'origine, sans erreur", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await db.exec(
      "INSERT INTO restaurants(id,name) VALUES('bernay','Bernay'); INSERT INTO profiles(id,name,role) VALUES('nadia','Nadia','OWNER'); INSERT INTO notifications VALUES('n1','bernay','Message existant',now())",
    );
    const nadia: Actor = { id: "nadia", name: "Nadia", role: "OWNER", roles: ["OWNER"] };
    await emit(db, "bernay", {
      type: "reservation.requested",
      module: "reservations",
      summary: "Nouvelle demande de réservation",
    });
    await emit(db, "bernay", { type: "action.menu", module: "menu", summary: "Sans notification" });
    await sweep(db, "bernay");
    const before = await listNotifications(db, "bernay", nadia);
    assert.deepEqual(
      before.items.map((n) => n.message).sort(),
      ["Message existant", "Nouvelle demande de réservation"],
    );
    assert.equal(before.unread, 2);
    assert.equal(before.items[0].module, "general");
    await markRead(db, "bernay", nadia);
    assert.equal((await listNotifications(db, "bernay", nadia)).unread, 0);
    assert.deepEqual(await preferences(db, "bernay", nadia), []);
    assert.deepEqual((await listHistory(db, "bernay", nadia)).items, []);
  } finally {
    await db.close();
  }
});

test("migrations 161/162 : retour arrière puis réapplication sans perte des notifications", async () => {
  const { migrate } = await import("../src/lib/database/migrate");
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await db.exec(
      "INSERT INTO restaurants(id,name) VALUES('bernay','Bernay'); INSERT INTO notifications VALUES('n1','bernay','Message existant',now())",
    );
    await migrate(db);
    // Idempotentes : une base de démo partagée peut les rejouer sans erreur.
    for (const file of ["161_operations_notifications.sql", "162_activity_categories.sql"])
      await db.exec(await readFile(`database/migrations/${file}`, "utf8"));
    for (const file of ["162_activity_categories.sql", "161_operations_notifications.sql"])
      await db.exec(await readFile(`database/migrations/down/${file}`, "utf8"));
    const gone = await db.query<{ t: string | null }>(
      "SELECT to_regclass('public.domain_events')::text AS t",
    );
    assert.equal(gone.rows[0].t, null);
    await migrate(db);
    const n = (
      await db.query<{ message: string; module: string }>(
        "SELECT message,module FROM notifications WHERE id='n1'",
      )
    ).rows[0];
    assert.deepEqual(n, { message: "Message existant", module: "general" });
  } finally {
    await db.close();
  }
});
