import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";

test("Studio credits are credited once after verified billing and reversed on refund", async()=>{
  const db=new PGlite();
  try{
    await db.exec(await readFile("database/migrations/001_core.sql","utf8"));
    await migrate(db);await db.transaction(seed);
    const orderId=randomUUID();
    await db.transaction(async(tx)=>{
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)");
      const opened=await tx.query<{id:string}>("SELECT app.studio_credit_open('bernay',$1,500) AS id",[orderId]);
      assert.equal(opened.rows[0].id,orderId);
      await tx.query("SELECT app.studio_credit_attach($1,'cs_test_credit')",[orderId]);
    });
    async function apply(refunded:number,disputed=false){
      return db.transaction(async(tx)=>{
        await tx.exec("SET LOCAL ROLE atacuisine_addon_billing");
        return tx.query("SELECT app.studio_credit_apply($1,'cs_test_credit','pi_test',true,$2,$3)",[orderId,refunded,disputed]);
      });
    }
    await apply(0);await apply(0);
    assert.equal((await db.query<{balance:number}>("SELECT coalesce(sum(delta_credits),0) AS balance FROM studio_credit_ledger")).rows[0].balance,500);
    assert.equal((await db.query("SELECT id FROM studio_credit_ledger")).rows.length,1);
    await apply(200);
    assert.equal((await db.query<{balance:number}>("SELECT coalesce(sum(delta_credits),0) AS balance FROM studio_credit_ledger")).rows[0].balance,300);
    await apply(200,true);
    assert.equal((await db.query<{balance:number}>("SELECT coalesce(sum(delta_credits),0) AS balance FROM studio_credit_ledger")).rows[0].balance,0);
    await apply(500);
    assert.equal((await db.query<{balance:number}>("SELECT coalesce(sum(delta_credits),0) AS balance FROM studio_credit_ledger")).rows[0].balance,0);
  }finally{await db.close();}
});
