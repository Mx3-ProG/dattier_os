import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import {
  moduleRequestSchema,
  moduleSuspensionPreflight,
} from "../src/features/modules/service";

test("suspension preflight counts live work only in the selected establishment", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const bernayBefore = await moduleSuspensionPreflight(db, "bernay");
    const atelierBefore = await moduleSuspensionPreflight(db, "atelier");
    const table = (
      await db.query<{ id: string }>(
        "SELECT id FROM dining_tables WHERE restaurant_id='bernay' LIMIT 1",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO table_sessions(id,table_id) VALUES('module-preflight-session',$1)",
      [table],
    );
    await db.query(
      "INSERT INTO orders(id,restaurant_id,session_id,channel,idempotency_key) VALUES('module-preflight-order','bernay','module-preflight-session','staff','module-preflight-order')",
    );
    await db.query(
      "INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at,table_id) VALUES('module-preflight-booking','bernay','Test','contact',2,now()+interval '1 day',now()+interval '1 day 2 hours',$1)",
      [table],
    );
    const bernayAfter = await moduleSuspensionPreflight(db, "bernay");
    assert.equal(
      bernayAfter.openTableSessions,
      bernayBefore.openTableSessions + 1,
    );
    assert.equal(bernayAfter.openTableOrders, bernayBefore.openTableOrders + 1);
    assert.equal(
      bernayAfter.upcomingReservations,
      bernayBefore.upcomingReservations + 1,
    );
    assert.deepEqual(
      await moduleSuspensionPreflight(db, "atelier"),
      atelierBefore,
    );
  } finally {
    await db.close();
  }
});

test("module request accepts only known modules and revisioned states", () => {
  assert.equal(
    moduleRequestSchema.safeParse({
      moduleId: "floor",
      requestedState: "suspended",
      revision: 0,
    }).success,
    true,
  );
  for (const value of [
    { moduleId: "unknown", requestedState: "enabled", revision: 0 },
    { moduleId: "floor", requestedState: "disabled", revision: 0 },
    { moduleId: "floor", requestedState: "enabled", revision: -1 },
    {
      moduleId: "floor",
      requestedState: "enabled",
      revision: 0,
      restaurant: "atelier",
    },
  ])
    assert.equal(moduleRequestSchema.safeParse(value).success, false);
});

test("module settings preserve existing access and isolate establishment data", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    assert.deepEqual(
      (await db.query("SELECT * FROM module_settings")).rows,
      [],
    );
    await db.query(
      "INSERT INTO module_settings(restaurant_id,module_id,requested_state,updated_by) VALUES('bernay','floor','suspended','nadia'),('atelier','floor','enabled','nadia')",
    );
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)",
      );
      assert.deepEqual(
        (
          await tx.query<{ restaurant_id: string }>(
            "SELECT restaurant_id FROM module_settings",
          )
        ).rows.map((row) => row.restaurant_id),
        ["bernay"],
      );
      await assert.rejects(
        tx.query(
          "UPDATE module_settings SET requested_state='enabled' WHERE restaurant_id='bernay'",
        ),
        /permission denied/,
      );
    });
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','atelier',true),set_config('app.public','false',true)",
      );
      assert.deepEqual(
        (
          await tx.query<{ restaurant_id: string }>(
            "SELECT restaurant_id FROM module_settings",
          )
        ).rows.map((row) => row.restaurant_id),
        ["atelier"],
      );
      await tx.query("SELECT set_config('app.public','true',true)");
      assert.deepEqual(
        (await tx.query("SELECT * FROM module_settings")).rows,
        [],
      );
    });
  } finally {
    await db.close();
  }
});

test("only an organization admin can record a revisioned module request", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    async function request(user: string, restaurant: string, revision: number) {
      return db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        await tx.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)",
          [user, restaurant],
        );
        return tx.query<{ revision: number }>(
          "SELECT app.request_module_state($1,'floor','suspended',$2) AS revision",
          [restaurant, revision],
        );
      });
    }
    assert.equal((await request("nadia", "bernay", 0)).rows[0].revision, 1);
    assert.equal((await request("nadia", "bernay", 1)).rows[0].revision, 2);
    await assert.rejects(request("nadia", "bernay", 1), /modifiée ailleurs/);
    assert.deepEqual(
      (
        await db.query<{
          previous_state: string | null;
          requested_state: string;
          revision: number;
        }>(
          "SELECT previous_state,requested_state,revision FROM module_setting_events WHERE restaurant_id='bernay' ORDER BY id",
        )
      ).rows,
      [
        { previous_state: null, requested_state: "suspended", revision: 1 },
        {
          previous_state: "suspended",
          requested_state: "suspended",
          revision: 2,
        },
      ],
    );
    await assert.rejects(
      request("sarah", "bernay", 2),
      /réservée à l’administrateur/,
    );
    await assert.rejects(
      request("nadia", "missing", 0),
      /réservée à l’administrateur/,
    );
    assert.equal(
      (
        await db.query<{ revision: number }>(
          "SELECT revision FROM module_settings WHERE restaurant_id='bernay'",
        )
      ).rows[0].revision,
      2,
    );
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','atelier',true),set_config('app.public','false',true)",
      );
      assert.deepEqual(
        (await tx.query("SELECT * FROM module_setting_events")).rows,
        [],
      );
      await tx.query("SELECT set_config('app.restaurant_id','bernay',true)");
      assert.equal(
        (await tx.query("SELECT * FROM module_setting_events")).rows.length,
        2,
      );
      await tx.query("SELECT set_config('app.public','true',true)");
      assert.deepEqual(
        (await tx.query("SELECT * FROM module_setting_events")).rows,
        [],
      );
    });
  } finally {
    await db.close();
  }
});

test("effective module suspension is tenant scoped and blocks new bookings and table sessions", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    async function command(restaurant: string, sql: string, params: unknown[]) {
      return db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        await tx.query(
          "SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id',$1,true),set_config('app.public','false',true)",
          [restaurant],
        );
        return tx.query<{ allowed: boolean }>(sql, params);
      });
    }
    assert.equal(
      (
        await command(
          "atelier",
          "SELECT app.module_enabled($1::text,'table-booking'::text) AS allowed",
          ["atelier"],
        )
      ).rows[0].allowed,
      true,
    );
    await command(
      "bernay",
      "SELECT app.request_module_state($1,'table-booking','suspended',0)",
      ["bernay"],
    );
    await assert.rejects(
      command("bernay", "SELECT app.apply_module_state($1,'table-booking',1)", [
        "bernay",
      ]),
      /réservations à venir/,
    );
    await db.query(
      "UPDATE reservations SET status='cancelled' WHERE restaurant_id='bernay' AND status IN ('requested','confirmed','arrived') AND ends_at>now()",
    );
    await command(
      "bernay",
      "SELECT app.apply_module_state($1,'table-booking',1)",
      ["bernay"],
    );
    assert.equal(
      (
        await command(
          "bernay",
          "SELECT app.module_enabled($1::text,'table-booking'::text) AS allowed",
          ["bernay"],
        )
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await command(
          "atelier",
          "SELECT app.module_enabled($1::text,'table-booking'::text) AS allowed",
          ["atelier"],
        )
      ).rows[0].allowed,
      true,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at) VALUES('suspended-booking','bernay','Test','contact',2,now()+interval '1 day',now()+interval '2 days')",
      ),
      /Module suspendu/,
    );
    const cancelled = (await db.query<{ id: string }>(
      "SELECT id FROM reservations WHERE restaurant_id='bernay' AND status='cancelled' AND ends_at>now() LIMIT 1",
    )).rows[0];
    if (cancelled)
      await assert.rejects(
        db.query("UPDATE reservations SET status='requested' WHERE id=$1", [cancelled.id]),
        /Module suspendu/,
      );
    await command(
      "bernay",
      "SELECT app.request_module_state($1,'floor','suspended',0)",
      ["bernay"],
    );
    await db.query(
      "UPDATE orders SET status='paid' WHERE restaurant_id='bernay' AND session_id IS NOT NULL AND status IN ('pending','active')",
    );
    await db.query(
      "UPDATE table_sessions SET closed_at=now() WHERE table_id IN (SELECT id FROM dining_tables WHERE restaurant_id='bernay') AND closed_at IS NULL",
    );
    const table = (
      await db.query<{ id: string }>(
        "SELECT id FROM dining_tables WHERE restaurant_id='bernay' LIMIT 1",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO table_sessions(id,table_id,closed_at) VALUES('module-closed-session',$1,now())",
      [table],
    );
    await command("bernay", "SELECT app.apply_module_state($1,'floor',1)", [
      "bernay",
    ]);
    await assert.rejects(
      db.query(
        "INSERT INTO table_sessions(id,table_id) VALUES('suspended-session',$1)",
        [table],
      ),
      /Module suspendu/,
    );
    await assert.rejects(
      db.query("UPDATE table_sessions SET closed_at=NULL WHERE id='module-closed-session'"),
      /Module suspendu/,
    );
    assert.equal(
      (
        await command(
          "atelier",
          "SELECT app.module_enabled($1::text,'floor'::text) AS allowed",
          ["atelier"],
        )
      ).rows[0].allowed,
      true,
    );
    await command("bernay", "SELECT app.request_module_state($1,'floor','enabled',1)", ["bernay"]);
    await command("bernay", "SELECT app.apply_module_state($1,'floor',2)", ["bernay"]);
    await command("bernay", "SELECT app.request_module_state($1,'table-booking','enabled',1)", ["bernay"]);
    await command("bernay", "SELECT app.apply_module_state($1,'table-booking',2)", ["bernay"]);
    assert.equal(
      (await command("bernay", "SELECT app.module_enabled($1::text,'table-booking'::text) AS allowed", ["bernay"])).rows[0].allowed,
      true,
    );
  } finally {
    await db.close();
  }
});
