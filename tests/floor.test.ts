import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { perform, actionSchema } from "../src/lib/actions";
import { scope, type Actor } from "../src/lib/auth/session";
import { platformPerform } from "../src/features/platform/service";
import { snapshot } from "../src/lib/snapshot";
import {
  availability,
  booking,
  parisDate,
} from "../src/features/reservations/service";
let db: PGlite;
const nadia: Actor = { id: "nadia", name: "Nadia", role: "OWNER" },
  lina: Actor = { id: "lina", name: "Lina", role: "MANAGER" },
  sarah: Actor = { id: "sarah", name: "Sarah", role: "WAITER" },
  hugo: Actor = { id: "hugo", name: "Hugo", role: "OWNER" };
// Les actions passent par le même cadrage que l’API : rôles relus dans la base.
const act = (user: Actor, input: unknown, r = "bernay") =>
  db.transaction(async (tx) =>
    perform(tx, r, await scope(tx, user, r), actionSchema.parse(input)),
  );
const zonesOf = (r: string) =>
  rows<{ id: string; name: string; position: number }>(
    db,
    "SELECT id,name,position FROM floor_zones WHERE restaurant_id=$1 ORDER BY position",
    [r],
  );
const openDay = () => {
  for (let n = 3; ; n++) {
    const d = parisDate(Date.now() + n * 86400000);
    if (
      !booking.closedWeekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())
    )
      return d;
  }
};
const table = (number: number, zoneId: string, extra: object = {}) => ({
  action: "saveTable",
  number,
  capacity: 4,
  zoneId,
  shape: "square",
  bookable: true,
  ...extra,
});
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  await db.exec(`
    INSERT INTO organizations(id,name) VALUES ('bistrot-org','Bistrot');
    SELECT app.configure_organization_plan('bistrot-org',39,1);
    INSERT INTO restaurants(id,name,address,phone,goal,organization_id)
    VALUES ('bistrot','Bistrot','','',10000,'bistrot-org');
    INSERT INTO profiles(id,name,role) VALUES ('hugo','Hugo','OWNER');
    INSERT INTO memberships VALUES ('hugo','bistrot','OWNER');
  `);
});
after(() => db.close());

test("zones : les tables existantes sont rattachées, création, renommage, ordre", async () => {
  const zones = await zonesOf("bernay");
  assert.deepEqual(
    zones.map((z) => z.name),
    ["Salle principale", "Terrasse"],
  );
  // Une nouvelle structure démarre avec une salle principale.
  assert.deepEqual(
    (await zonesOf("bistrot")).map((z) => z.name),
    ["Salle principale"],
  );
  const etage = (await act(nadia, {
    action: "saveZone",
    name: "Étage",
  })) as unknown as string;
  await assert.rejects(
    act(nadia, { action: "saveZone", name: "terrasse" }),
    /déjà/,
  );
  await act(nadia, { action: "moveZone", id: etage, direction: -1 });
  assert.deepEqual(
    (await zonesOf("bernay")).map((z) => z.name),
    ["Salle principale", "Étage", "Terrasse"],
  );
  const terrasse = zones[1].id;
  await act(nadia, { action: "saveZone", id: terrasse, name: "Patio" });
  const t9 = await one<{ zone: string; zone_id: string }>(
    db,
    "SELECT zone,zone_id FROM dining_tables WHERE id='bernay-t9'",
  );
  assert.deepEqual(t9, { zone: "Patio", zone_id: terrasse });
  // Le plan public suit l’ordre des zones et garde l’angle des tables.
  const day = await availability(db, "bernay", { date: openDay(), guests: 2 });
  assert.deepEqual(day.zones, ["Salle principale", "Patio"]);
  assert.equal(day.tables.find((t) => t.id === "bernay-t10")?.rotation, 45);
  await act(nadia, { action: "saveZone", id: terrasse, name: "Terrasse" });
});

test("zones : une zone avec des tables à historique ne se supprime pas", async () => {
  const [salle, etage] = await zonesOf("bernay");
  // La table 6 a un service clôturé dans le seed : on la déplace à l’étage.
  const t6 = { id: "bernay-t6", capacity: 6, shape: "rect" };
  await act(nadia, table(6, etage.id, t6));
  await assert.rejects(
    act(nadia, { action: "deleteZone", id: etage.id }),
    /la table 6 avec un historique.*déplacez-la/,
  );
  const scratch = (await act(nadia, table(40, etage.id))) as unknown as string;
  await act(nadia, table(6, salle.id, t6));
  await act(nadia, { action: "deleteZone", id: etage.id });
  assert.equal((await zonesOf("bernay")).length, 2);
  // La table sans historique part avec sa zone.
  assert.equal(
    (await rows(db, "SELECT 1 FROM dining_tables WHERE id=$1", [scratch]))
      .length,
    0,
  );
  const [only] = await zonesOf("bistrot");
  await assert.rejects(
    act(hugo, { action: "deleteZone", id: only.id }, "bistrot"),
    /au moins une zone/,
  );
  // Une zone d’un autre établissement est refusée.
  await assert.rejects(act(nadia, table(41, only.id)));
});

test("rotation : angle enregistré, normalisé et refusé hors bornes", async () => {
  await act(nadia, { action: "rotateTable", id: "bernay-t5", rotation: 90 });
  await act(nadia, { action: "rotateTable", id: "bernay-t6", rotation: 15 });
  const [salle] = await zonesOf("bernay");
  const id = (await act(
    nadia,
    table(42, salle.id, { rotation: 30 }),
  )) as unknown as string;
  const angles = await rows<{ id: string; rotation: number }>(
    db,
    "SELECT id,rotation FROM dining_tables WHERE id=ANY($1::text[]) ORDER BY number",
    [["bernay-t5", "bernay-t6", id]],
  );
  assert.deepEqual(
    angles.map((a) => a.rotation),
    [90, 15, 30],
  );
  assert.throws(() =>
    actionSchema.parse({ action: "rotateTable", id, rotation: 360 }),
  );
  await assert.rejects(
    db.query("UPDATE dining_tables SET rotation=400 WHERE id=$1", [id]),
  );
  const day = await availability(db, "bernay", { date: openDay(), guests: 2 });
  assert.equal(day.tables.find((t) => t.id === "bernay-t5")?.rotation, 90);
  await act(nadia, { action: "tableLifecycle", id, operation: "delete" });
});

test("abonnement Studio : aucun plafond de tables, hors abonnement le plafond SQL reste à 50", async () => {
  const [salle] = await zonesOf("bistrot");
  for (let n = 1; n <= 55; n++) await act(hugo, table(n, salle.id), "bistrot");
  const s = await db.transaction((tx) => snapshot(tx, hugo, "bistrot"));
  assert.deepEqual(
    { quota: s.floorPlan.quota, active: s.floorPlan.active },
    { quota: null, active: 55 },
  );
  const quota = await one<{ studio: number | null; none: number | null }>(
    db,
    "SELECT app.table_quota(39) AS studio, app.table_quota(0) AS none",
  );
  assert.deepEqual({ ...quota }, { studio: null, none: 50 });
  await db.query("DELETE FROM dining_tables WHERE restaurant_id='bistrot'");
});

test("droit d’aménager : retiré par le propriétaire, refusé côté serveur", async () => {
  // Par défaut, la salle peut déplacer les tables.
  await act(sarah, { action: "moveTable", id: "bernay-t2", x: 30, y: 30 });
  // Seul le propriétaire décide : ni le manager ni la serveuse elle-même.
  await assert.rejects(
    db.transaction((tx) =>
      platformPerform(tx, lina, {
        action: "floorLayout",
        restaurant: "bernay",
        profile: "sarah",
        allowed: false,
      }),
    ),
    /non autorisée/,
  );
  await db.transaction((tx) =>
    platformPerform(tx, nadia, {
      action: "floorLayout",
      restaurant: "bernay",
      profile: "sarah",
      allowed: false,
    }),
  );
  const [salle] = await zonesOf("bernay");
  for (const input of [
    { action: "moveTable", id: "bernay-t2", x: 60, y: 60 },
    { action: "rotateTable", id: "bernay-t2", rotation: 45 },
    table(60, salle.id),
    { action: "saveZone", name: "Bar" },
    { action: "tableLifecycle", id: "bernay-t2", operation: "archive" },
  ])
    await assert.rejects(act(sarah, input), /pas donné le droit/);
  const t2 = await one<{ pos_x: number; rotation: number }>(
    db,
    "SELECT pos_x,rotation FROM dining_tables WHERE id='bernay-t2'",
  );
  assert.deepEqual(t2, { pos_x: 30, rotation: 0 });
  // Le service continue : changer l’état d’une table reste permis.
  await act(sarah, { action: "table", id: "bernay-t1", status: "cleaning" });
  await act(sarah, { action: "table", id: "bernay-t1", status: "free" });
  const own = await db.transaction((tx) => snapshot(tx, sarah, "bernay"));
  assert.equal(own.floorPlan.canArrange, false);
  // Le manager garde son droit ; le propriétaire peut le rendre à Sarah.
  await act(lina, { action: "moveTable", id: "bernay-t2", x: 32, y: 30 });
  await db.transaction((tx) =>
    platformPerform(tx, nadia, {
      action: "floorLayout",
      restaurant: "bernay",
      profile: "sarah",
      allowed: true,
    }),
  );
  await act(sarah, { action: "moveTable", id: "bernay-t2", x: 34, y: 30 });
});

test("droit d’aménager : la base refuse qu’un membre se l’accorde", async () => {
  await db.exec(
    "CREATE ROLE floor_app NOLOGIN; GRANT USAGE ON SCHEMA public,app TO floor_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO floor_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO floor_app;",
  );
  const asUser = (id: string, fn: (tx: DB) => Promise<unknown>) =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE floor_app");
      await tx.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)",
        [id],
      );
      return fn(tx);
    });
  await assert.rejects(
    asUser("sarah", (tx) =>
      tx.query(
        "INSERT INTO floor_layout_access(restaurant_id,profile_id,allowed) VALUES('bernay','youssef',true) ON CONFLICT(restaurant_id,profile_id) DO UPDATE SET allowed=true",
      ),
    ),
  );
  await asUser("nadia", (tx) =>
    tx.query(
      "INSERT INTO floor_layout_access(restaurant_id,profile_id,allowed) VALUES('bernay','youssef',false)",
    ),
  );
});
