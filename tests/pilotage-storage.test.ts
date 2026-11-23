import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import {
  readPilotage,
  savePilotage,
  pilotageSaveSchema,
} from "../src/features/pilotage/service";
import type { Actor } from "../src/infrastructure/auth/session";
const nadia: Actor = { id: "nadia", name: "Nadia", role: "OWNER" };
const leila: Actor = { id: "leila", name: "Leïla", role: "ACCOUNTANT" };
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
test("pilotage persists per person and establishment; stale writes are rejected", async () => {
  await migrate(db);
  assert.equal((await readPilotage(db, nadia, "bernay")).revision, 0);
  const saved = await savePilotage(db, nadia, "bernay", {
    hidden: ["sales", "sales"],
    revision: 0,
  });
  assert.deepEqual(saved.hidden, ["sales"]);
  assert.equal(saved.revision, 1);
  assert.deepEqual((await readPilotage(db, nadia, "atelier")).hidden, []);
  assert.deepEqual((await readPilotage(db, leila, "bernay")).hidden, []);
  await assert.rejects(
    savePilotage(db, nadia, "bernay", { hidden: [], revision: 0 }),
    /modifiées ailleurs/,
  );
  await savePilotage(db, nadia, "bernay", { hidden: ["qr"], revision: 1 });
  await assert.rejects(
    savePilotage(db, nadia, "bernay", { hidden: [], revision: 1 }),
    /modifiées ailleurs/,
  );
  assert.deepEqual((await readPilotage(db, nadia, "bernay")).hidden, ["qr"]);
});
test("pilotage validates schema, membership and finance role", async () => {
  for (const raw of [
    { hidden: ["unknown"], revision: 0 },
    { hidden: [], revision: -1 },
    { hidden: [], revision: 0, userId: "nadia" },
  ])
    assert.equal(pilotageSaveSchema.safeParse(raw).success, false);
  await assert.rejects(readPilotage(db, leila, "atelier"), /autorisé/);
  await assert.rejects(
    savePilotage(db, { id: "lina", name: "Lina", role: "MANAGER" }, "bernay", {
      hidden: [],
      revision: 0,
    }),
    /refusé/,
  );
});
test("RLS blocks another profile, another context and public access", async () => {
  await savePilotage(db, leila, "bernay", { hidden: ["goal"], revision: 0 });
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE atacuisine_app");
    await tx.query(
      "SELECT set_config('app.user_id','leila',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)",
    );
    const own = await tx.query("SELECT profile_id FROM pilotage_preferences");
    assert.deepEqual(own.rows, [{ profile_id: "leila" }]);
    await tx.query(
      "UPDATE pilotage_preferences SET hidden='{}' WHERE profile_id='nadia'",
    );
    await tx.query("SELECT set_config('app.restaurant_id','atelier',true)");
    assert.deepEqual(
      (await tx.query("SELECT * FROM pilotage_preferences")).rows,
      [],
    );
    await tx.query(
      "SELECT set_config('app.restaurant_id','bernay',true),set_config('app.public','true',true)",
    );
    assert.deepEqual(
      (await tx.query("SELECT * FROM pilotage_preferences")).rows,
      [],
    );
  });
  assert.deepEqual((await readPilotage(db, nadia, "bernay")).hidden, ["qr"]);
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id','leila',true),set_config('app.restaurant_id','atelier',true)",
      );
      await tx.query(
        "INSERT INTO pilotage_preferences(restaurant_id,profile_id) VALUES('atelier','leila')",
      );
    }),
    /row-level security/,
  );
});
