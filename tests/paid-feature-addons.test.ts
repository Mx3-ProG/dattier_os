import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";

test("paid feature rights, team access and installation are isolated by establishment", async () => {
  const db=new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql","utf8"));
    await migrate(db); await db.transaction(seed);
    const app=async (restaurant:string,query:string,params:unknown[]=[])=>db.transaction(async tx=>{
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id',$1,true),set_config('app.public','false',true)",[restaurant]);
      return tx.query<{enabled:boolean}>(query,params);
    });
    assert.equal((await app("bernay","SELECT app.addon_installed('bernay','attendance') AS enabled")).rows[0].enabled,true);
    await db.query("INSERT INTO time_entries VALUES('paid-clock','bernay','nadia','start',now())");
    assert.equal((await app("bernay","SELECT * FROM time_entries WHERE id='paid-clock'")).rows.length,1);
    await db.query("DELETE FROM addon_legacy_grants WHERE restaurant_id='bernay' AND addon_id IN ('attendance','qr')");
    assert.equal((await app("bernay","SELECT app.addon_installed('bernay','attendance') AS enabled")).rows[0].enabled,false);
    assert.equal((await app("atelier","SELECT app.addon_installed('atelier','attendance') AS enabled")).rows[0].enabled,true);
    assert.equal((await app("bernay","SELECT * FROM time_entries WHERE id='paid-clock'")).rows.length,0);
    await db.query("INSERT INTO addon_subscriptions(id,restaurant_id,addon,stripe_session) VALUES('attendance-test','bernay','attendance','cs_attendance')");
    await db.query("SELECT app.addon_reconcile('attendance-test','cs_attendance','sub_attendance','active',now()+interval '1 month')");
    assert.equal((await app("bernay","SELECT app.addon_installed('bernay','attendance') AS enabled")).rows[0].enabled,true);
    await app("bernay","SELECT app.addon_installation_set('bernay','attendance',false)");
    assert.equal((await app("bernay","SELECT app.addon_installed('bernay','attendance') AS enabled")).rows[0].enabled,false);
    assert.equal((await app("atelier","SELECT app.addon_installed('atelier','attendance') AS enabled")).rows[0].enabled,true);
    await assert.rejects(db.query("INSERT INTO addon_subscriptions(id,restaurant_id,addon) VALUES('unknown','bernay','unknown')"));
  } finally {await db.close();}
});

test("migration preserves rights of establishments that existed before paid add-ons", async () => {
  const db=new PGlite();
  try {
    const directory="database/migrations";
    const files=(await readdir(directory)).filter(name=>/^\d{3}_.*\.sql$/.test(name) && Number(name.slice(0,3))<=72).sort();
    for (const file of files) await db.exec(await readFile(`${directory}/${file}`,"utf8"));
    await db.query("SELECT app.configure_organization_plan('legacy',99,2)");
    await db.query("INSERT INTO restaurants(id,name,address,phone,goal) VALUES('old-a','Ancien','', '',1000),('old-b','Ancien','', '',1000)");
    await db.exec(await readFile(`${directory}/073_paid_feature_addons.sql`,"utf8"));
    await db.exec(await readFile(`${directory}/074_paid_feature_access.sql`,"utf8"));
    const grants=await db.query<{addon_id:string}>("SELECT addon_id FROM addon_legacy_grants WHERE restaurant_id='old-a'");
    assert.equal(grants.rows.length,8);
    assert.equal((await db.query<{allowed:boolean}>("SELECT app.addon_entitled('old-a','invoices') AS allowed")).rows[0].allowed,true);
  } finally {await db.close();}
});
