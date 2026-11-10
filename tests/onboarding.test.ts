import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { platformPerform, saveOnboardingDraft } from "../src/features/platform/service";
import { customerImport, parseCustomerCsv } from "../src/features/onboarding/customer-import";
import { industries, trades, freeTradeTools } from "../src/features/onboarding/catalog";
import { requireRestaurantIndustry } from "../src/features/onboarding/access";
import { onboardingInput } from "./support/onboarding";
import type { DB } from "../src/lib/database/db";

test("parcours métier : brouillon, création unique, licences et droits", async () => {
  const db=new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql","utf8"));
    await migrate(db);
    await db.exec("CREATE ROLE onboarding_app NOLOGIN; GRANT USAGE ON SCHEMA public,app TO onboarding_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO onboarding_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO onboarding_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO onboarding_app;");
    const asUser=<T>(id:string,restaurant:string,fn:(tx:DB)=>Promise<T>)=>db.transaction(async(tx)=>{
      await tx.exec("SET LOCAL ROLE onboarding_app");
      await tx.query("SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true)",[id,restaurant]);
      return fn(tx);
    });
    for (const [index,industry] of industries.entries()) {
      const id="owner-"+index;
      await db.query("INSERT INTO profiles(id,name,role,email) VALUES($1,$1,'OWNER',$2)",[id,id+"@example.test"]);
      const input={...onboardingInput(),activity:{industry,trade:trades[industry][0],tradeDetail:industry==="other"?"Activité indépendante":""}};
      await asUser(id,"",(tx)=>saveOnboardingDraft(tx,{id,name:id,role:"OWNER"},input));
      const saved=await asUser(id,"",async(tx)=>(await tx.query<{draft:{requestKey:string}}>("SELECT draft FROM onboarding_drafts WHERE profile_id=$1",[id])).rows[0].draft);
      assert.equal(saved.requestKey,input.requestKey);
      const created=await asUser(id,"",(tx)=>platformPerform(tx,{id,name:id,role:"OWNER"},{action:"onboard",organization:"Organisation "+index,restaurant:"Établissement "+index,...input})) as {organization:string;restaurant:string};
      const repeated=await asUser(id,"",(tx)=>platformPerform(tx,{id,name:id,role:"OWNER"},{action:"onboard",organization:"Organisation "+index,restaurant:"Établissement "+index,...input})) as {organization:string;restaurant:string};
      assert.equal(repeated.organization,created.organization);
      assert.equal(repeated.restaurant,created.restaurant);
      assert.equal((await db.query<{n:number}>("SELECT count(*)::int AS n FROM organizations WHERE created_by=$1",[id])).rows[0].n,1);
      assert.equal((await db.query<{n:number}>("SELECT count(*)::int AS n FROM onboarding_drafts WHERE profile_id=$1",[id])).rows[0].n,0);
      const actual=(await db.query<{product_id:string}>("SELECT product_id FROM addon_licenses WHERE restaurant_id=$1 AND status='active' AND source='free'",[created.restaurant])).rows.map((r)=>r.product_id);
      assert.deepEqual(actual.sort(),[...freeTradeTools[industry]].sort());
      if (industry!=="restaurant") {
        assert.equal((await db.query<{ok:boolean}>("SELECT app.module_enabled($1,'floor') AS ok",[created.restaurant])).rows[0].ok,false);
        await assert.rejects(asUser(id,created.restaurant,(tx)=>requireRestaurantIndustry(tx,created.restaurant)),/restauration/);
      }
      if (industry==="construction") {
        await asUser(id,created.restaurant,(tx)=>platformPerform(tx,{id,name:id,role:"OWNER"},{
          action:"activity",restaurant:created.restaurant,
          activity:{industry:"beauty",trade:"Salon de coiffure",tradeDetail:""},
        }));
        assert.equal((await db.query<{installed:boolean}>("SELECT installed FROM addon_installations WHERE restaurant_id=$1 AND addon_id='site-planning'",[created.restaurant])).rows[0].installed,false);
        assert.equal((await db.query<{installed:boolean}>("SELECT installed FROM addon_installations WHERE restaurant_id=$1 AND addon_id='appointment-booking'",[created.restaurant])).rows[0].installed,true);
      }
    }
  } finally { await db.close(); }
});

test("CSV clients : aperçu, doublons et fiches sans consentement",async()=>{
  const db=new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql","utf8"));
    await migrate(db);
    await db.query("INSERT INTO organizations(id,name) VALUES('import-org','Import')");
    await db.query("INSERT INTO restaurants(id,name,organization_id) VALUES('import-r','Import','import-org')");
    const csv='\uFEFFNom;Email\nAlice;alice@example.test\nBob;bob@example.test\nRépétition;ALICE@example.test\nSans contact;\n';
    const parsed=parseCustomerCsv(csv);
    assert.deepEqual(parsed.headers,["Nom","Email"]);
    const preview=await db.transaction((tx)=>customerImport(tx,"import-r",{csv,nameColumn:0,contactColumn:1,commit:false}));
    assert.equal(preview.ready,2);assert.equal(preview.skipped,2);
    const result=await db.transaction((tx)=>customerImport(tx,"import-r",{csv,nameColumn:0,contactColumn:1,commit:true}));
    assert.equal(result.created,2);
    const repeat=await db.transaction((tx)=>customerImport(tx,"import-r",{csv,nameColumn:0,contactColumn:1,commit:true}));
    assert.equal(repeat.created,0);
    const stored=(await db.query<{consent:boolean;points:number;account_id:string|null}>("SELECT consent,points,account_id FROM customers WHERE restaurant_id='import-r'")).rows;
    assert.equal(stored.length,2);
    assert.ok(stored.every((r)=>r.consent===false && r.points===0 && r.account_id===null));
    assert.throws(()=>parseCustomerCsv('Nom,Email\n\"Alice,alice@example.test'),/non fermés/);
  } finally { await db.close(); }
});
