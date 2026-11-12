import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";

test("sécurité, SEO, visibilité locale, connexions et hors ligne restent par établissement", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    for (const restaurant of ["bernay", "atelier"]) {
      await db.query(
        "INSERT INTO security_incidents(id,restaurant_id,rule,message) VALUES($1,$2,'tenant-check','Test')",
        [`security-${restaurant}`, restaurant],
      );
      await db.query(
        "INSERT INTO seo_audits(id,restaurant_id,trigger,report) VALUES($1,$2,'tenant-check','{}')",
        [`seo-${restaurant}`, restaurant],
      );
      await db.query(
        "INSERT INTO seo_ai_observations(id,restaurant_id,observed_on,assistant,query,cited) VALUES($1,$2,current_date,'test','visibilité locale',false)",
        [`observation-${restaurant}`, restaurant],
      );
      await db.query(
        "INSERT INTO restaurant_domains(hostname,restaurant_id,verification_hash) VALUES($1,$2,'hash')",
        [`${restaurant}.example.test`, restaurant],
      );
      await db.query(
        "INSERT INTO integration_connections(id,restaurant_id,kind,provider) VALUES($1,$2,'accounting','test')",
        [`connection-${restaurant}`, restaurant],
      );
      await db.query(
        "INSERT INTO offline_devices(id,restaurant_id,profile_id,name) VALUES($1,$2,'nadia','Tablette')",
        [`device-${restaurant}`, restaurant],
      );
      await db.query(
        "INSERT INTO ops_auth_presence(restaurant_id,profile_id,session_ref) VALUES($1,'nadia','tenant-check')",
        [restaurant],
      );
      await db.query(
        "INSERT INTO restaurant_session_revocations(restaurant_id,profile_id,not_before) VALUES($1,'nadia',now())",
        [restaurant],
      );
    }
    const atelierMenu = (
      await db.query<{ id: string }>(
        "SELECT id FROM menu_items WHERE restaurant_id='atelier' LIMIT 1",
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        "INSERT INTO offline_quotas(id,device_id,menu_id,quantity,catalog) VALUES('wrong-quota','device-bernay',$1,1,'{}')",
        [atelierMenu],
      ),
      /Référence hors ligne d’un autre établissement/,
    );
    await db.query(
      "INSERT INTO offline_operations(id,device_id,payload,payload_hash,status) VALUES('operation-bernay','device-bernay','{}','hash','conflict')",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO offline_conflict_decisions(id,restaurant_id,operation_id,decision,reason,actor_id) VALUES('wrong-decision','atelier','operation-bernay','reject','motif de refus suffisamment long','nadia')",
      ),
      /Référence hors ligne d’un autre établissement/,
    );
    const tables = [
      "security_incidents",
      "seo_audits",
      "seo_ai_observations",
      "restaurant_domains",
      "integration_connections",
      "offline_devices",
      "ops_auth_presence",
      "ops_security_settings",
      "restaurant_session_revocations",
    ];
    for (const restaurant of ["bernay", "atelier"]) {
      await db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        await tx.query(
          "SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id',$1,true),set_config('app.public','false',true)",
          [restaurant],
        );
        for (const table of tables) {
          const result = await tx.query<{ restaurant_id: string }>(
            `SELECT restaurant_id FROM ${table} WHERE restaurant_id IN ('bernay','atelier')`,
          );
          assert.ok(result.rows.length > 0, `${table}: no visible fixture`);
          assert.ok(
            result.rows.every((row) => row.restaurant_id === restaurant),
            `${table}: another establishment is visible`,
          );
        }
      });
    }
  } finally {
    await db.close();
  }
});
