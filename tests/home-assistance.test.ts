import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { recurringDates, visitPrice } from "../src/features/home-assistance/domain";

test("tarification et récurrences gardent des montants entiers et des dates UTC", () => {
  assert.equal(visitPrice(1999, 90, 250), 3249);
  assert.deepEqual(recurringDates("2026-12-01T10:00:00Z","2026-12-01T11:00:00Z","weekly",2), [
    {startsAt:"2026-12-01T10:00:00.000Z",endsAt:"2026-12-01T11:00:00.000Z"},
    {startsAt:"2026-12-08T10:00:00.000Z",endsAt:"2026-12-08T11:00:00.000Z"},
  ]);
  assert.throws(() => recurringDates("2026-12-01T10:00:00Z","2026-12-01T11:00:00Z","weekly",53));
  assert.deepEqual(recurringDates("2026-03-22T09:00:00Z","2026-03-22T10:00:00Z","weekly",2)[1],
    {startsAt:"2026-03-29T08:00:00.000Z",endsAt:"2026-03-29T09:00:00.000Z"});
});

test("aide à la personne : secteur, bénéficiaires isolés, affectation sans chevauchement", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.query("INSERT INTO organizations(id,name) VALUES('home-org','Maison'),('other-org','Autre')");
    await db.query("INSERT INTO restaurants(id,name,organization_id,industry) VALUES('home-r','Maison','home-org','home_assistance'),('other-r','Autre','other-org','services')");
    await db.query("INSERT INTO profiles(id,name,role,email) VALUES('owner-home','Gestion','OWNER','owner-home@example.test'),('worker-home','Intervenant','WAITER','worker-home@example.test')");
    await db.query("INSERT INTO memberships(profile_id,restaurant_id,role) VALUES('owner-home','home-r','OWNER'),('worker-home','home-r','WAITER')");
    await db.query("INSERT INTO customers(id,restaurant_id,name,contact) VALUES('home-c','home-r','Client','test@example.test')");
    await db.query("INSERT INTO profiles(id,name,role,email) VALUES('customer-home','Client','WAITER','customer-home@example.test')");
    await db.query("INSERT INTO organization_customers(id,organization_id,subject,email,name) VALUES('home-account','home-org','customer-home','customer-home@example.test','Client')");
    await db.query("UPDATE customers SET account_id='home-account' WHERE id='home-c'");
    await db.query("INSERT INTO home_beneficiaries(id,restaurant_id,customer_id,name) VALUES('home-b','home-r','home-c','Bénéficiaire')");
    await assert.rejects(db.query("INSERT INTO home_beneficiaries(id,restaurant_id,customer_id,name) VALUES('wrong-b','other-r','home-c','Erreur')"));
    await db.query("INSERT INTO home_workers(id,restaurant_id,profile_id) VALUES('home-w','home-r','worker-home')");
    await db.query("INSERT INTO home_services(id,restaurant_id,name,hourly_cents) VALUES('home-s','home-r','Entretien',3000)");
    await db.query("INSERT INTO home_worker_availability(id,restaurant_id,worker_id,starts_at,ends_at) VALUES('home-a','home-r','home-w','2026-12-01T08:00:00Z','2026-12-01T18:00:00Z')");
    await db.query("INSERT INTO home_worker_availability(id,restaurant_id,worker_id,starts_at,ends_at,available) VALUES('home-absence','home-r','home-w','2026-12-01T13:00:00Z','2026-12-01T14:00:00Z',false)");
    await db.query("INSERT INTO home_visits(id,restaurant_id,beneficiary_id,worker_id,service_name,starts_at,ends_at,price_cents) VALUES('home-v1','home-r','home-b','home-w','Entretien','2026-12-01T10:00:00Z','2026-12-01T11:00:00Z',3000)");
    await assert.rejects(db.query("INSERT INTO home_visits(id,restaurant_id,beneficiary_id,worker_id,service_name,starts_at,ends_at,price_cents) VALUES('home-v2','home-r','home-b','home-w','Entretien','2026-12-01T11:10:00Z','2026-12-01T12:00:00Z',3000)"), /affecté/);
    await db.query("INSERT INTO home_visits(id,restaurant_id,beneficiary_id,worker_id,service_name,starts_at,ends_at,price_cents) VALUES('home-v3','home-r','home-b','home-w','Entretien','2026-12-01T11:30:00Z','2026-12-01T12:00:00Z',3000)");
    await assert.rejects(db.query("UPDATE home_visits SET price_cents=1 WHERE id='home-v1'"),/prix figé/);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM home_visits WHERE restaurant_id='home-r'")).rows[0].count, 2);
    await db.exec("CREATE ROLE home_test_app NOLOGIN; GRANT atacuisine_app TO home_test_app");
    const visible = async (profile: string, restaurant: string) => db.transaction(async tx => {
      await tx.exec("SET LOCAL ROLE home_test_app");
      await tx.query("SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true)", [profile, restaurant]);
      return (await tx.query<{ id: string }>("SELECT id FROM home_beneficiaries")).rows;
    });
    assert.equal((await visible("owner-home", "home-r")).length, 1);
    assert.equal((await visible("worker-home", "home-r")).length, 0);
    assert.equal((await visible("customer-home", "home-r")).length, 1);
    assert.equal((await visible("owner-home", "other-r")).length, 0);
    const visibleVisits=async(profile:string)=>db.transaction(async tx=>{
      await tx.exec("SET LOCAL ROLE home_test_app");
      await tx.query("SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id','home-r',true)",[profile]);
      return (await tx.query<{id:string}>("SELECT id FROM home_visits ORDER BY id")).rows.map(r=>r.id);
    });
    assert.deepEqual(await visibleVisits("worker-home"),["home-v1","home-v3"]);
    assert.deepEqual(await visibleVisits("customer-home"),["home-v1","home-v3"]);
    await db.query("UPDATE home_visits SET status='in_progress' WHERE id='home-v1'");
    await db.transaction(async tx => {
      await tx.exec("SET LOCAL ROLE home_test_app");
      await tx.query("SELECT set_config('app.user_id','worker-home',true),set_config('app.restaurant_id','home-r',true)");
      assert.equal((await tx.query<{id:string}>("SELECT app.home_worker_report('home-r','home-v1','Intervention effectuée',60) AS id")).rows[0].id,"home-v1");
    });
    await assert.rejects(db.transaction(async tx => {
      await tx.exec("SET LOCAL ROLE home_test_app");
      await tx.query("SELECT set_config('app.user_id','worker-home',true),set_config('app.restaurant_id','home-r',true)");
      await tx.query("SELECT app.home_worker_report('home-r','home-v3','Autre visite',60)");
    }));
    assert.equal((await db.query<{declared_minutes:number}>("SELECT declared_minutes FROM home_visits WHERE id='home-v1'")).rows[0].declared_minutes,60);
    await db.query("INSERT INTO profiles(id,name,role,email) VALUES('relative-home','Proche','WAITER','relative-home@example.test')");
    await db.query("INSERT INTO home_relative_grants(id,restaurant_id,beneficiary_id,profile_id,granted_by) VALUES('grant-home','home-r','home-b','relative-home','owner-home')");
    assert.equal((await visible("relative-home", "home-r")).length, 1);
    await db.query("UPDATE home_relative_grants SET revoked_at=now() WHERE id='grant-home'");
    assert.equal((await visible("relative-home", "home-r")).length, 0);
    await db.transaction(async tx=>{
      await tx.exec("SET LOCAL ROLE home_test_app");
      await tx.query("SELECT set_config('app.user_id','customer-home',true),set_config('app.restaurant_id','home-r',true)");
      const services=await tx.query<{id:string}>("SELECT id FROM app.home_portal_services('home-r')");
      assert.equal(services.rows[0]?.id,'home-s');
      const requested=await tx.query<{id:string}>("SELECT app.home_customer_request('home-r','home-b','home-s','2026-12-15T10:00:00Z','2026-12-15T11:00:00Z') AS id");
      assert.ok(requested.rows[0]?.id);
    });
  } finally { await db.close(); }
});
