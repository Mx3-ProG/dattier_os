import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { addonPriceCents } from "../src/features/addons/catalog";
import { crmSegmentStats, customerHealthScore, prepareCampaignAudience } from "../src/features/pilotage-addons/service";
import { sendCampaignBatch } from "../src/features/pilotage-addons/campaign-delivery";
import { proposalPdf } from "../src/features/pilotage-addons/proposal-document";
import { scheduleProposalFollowup } from "../src/features/pilotage-addons/automations";
import { paymentRecoveryData, recordPaymentFollowup } from "../src/features/pilotage-addons/payment-recovery";
import { nafCodes, scoreProspect } from "../src/features/pilotage-addons/scanner";
import { categoryCounts, defaultStoreFilters, featuresVisible, pilotageCategoryId } from "../src/features/addons/store-catalog";

test("Pilotage affiche les trois abonnements aux prix TTC et dans la bonne catégorie", () => {
  assert.equal(addonPriceCents("prospect-scanner"), 6900);
  assert.equal(addonPriceCents("pipeline-crm"), 6900);
  assert.equal(addonPriceCents("customer-health"), 8900);
  assert.equal(featuresVisible({ ...defaultStoreFilters, category: pilotageCategoryId }), true);
  assert.deepEqual(categoryCounts([], [], defaultStoreFilters, 7, 3), {
    features: 4, "pilotage-tools": 3, all: 7,
  });
  assert.deepEqual(categoryCounts([], [], { ...defaultStoreFilters, price: "free" }, 7, 3), {
    features: 0, "pilotage-tools": 0, all: 0,
  });
});

test("les scores restent explicables et bornés", () => {
  assert.deepEqual(nafCodes("Restaurant 56.10A et 56.10a"), ["56.10A"]);
  assert.deepEqual(nafCodes("coiffure", [{ activite_principale: "96.02A" }, { activite_principale: "96.02A" }]), ["96.02A"]);
  assert.equal(scoreProspect({ siret: "12345678901234", address: "Paris", activity: "56.10A", latitude: null, longitude: null }).score, 75);
  const score = customerHealthScore({ last_order_at: "2026-11-01T00:00:00.000Z", orders_90d: 4, points: 500 }, Date.parse("2026-11-10T00:00:00.000Z"));
  assert.deepEqual(score, { total: 100, recency: 50, frequency: 35, loyalty: 15 });
});

test("la proposition génère un PDF téléchargeable", async () => {
  const pdf = await proposalPdf({ id: "test", title: "Prestation test", amount_cents: 12345, proposal_status: "draft", proposal_description: "Une prestation de test", valid_until: "2026-12-12", created_at: "2026-11-12T00:00:00Z", expected_on: null, company_name: "Client test", company_address: null, company_city: null, customer_name: null, seller_name: "Commerce test", seller_address: "Paris", seller_phone: "" });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("CRM et scanner : abonnement et installation requis, données isolées par établissement", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const app = async (restaurant: string, query: string, params: unknown[] = []) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id',$1,true),set_config('app.public','false',true)", [restaurant]);
      return tx.query(query, params);
    });
    const allowed = async (addon: string) => (await app("bernay", "SELECT app.addon_installed('bernay',$1) AS allowed", [addon])).rows[0] as { allowed: boolean };
    assert.equal((await allowed("pipeline-crm")).allowed, false);
    assert.equal((await allowed("prospect-scanner")).allowed, false);
    assert.equal((await allowed("customer-health")).allowed, false);
    await assert.rejects(app("bernay", "INSERT INTO crm_companies(id,restaurant_id,name) VALUES('test-company','bernay','Client test')"));
    for (const addon of ["pipeline-crm", "prospect-scanner", "customer-health"]) {
      await db.query("INSERT INTO addon_subscriptions(id,restaurant_id,addon,stripe_session) VALUES($1,'bernay',$2,$3)", [`test-${addon}`, addon, `cs_test_${addon}`]);
      await db.query("SELECT app.addon_reconcile($1,$2,$3,'active',now()+interval '1 month')", [`test-${addon}`, `cs_test_${addon}`, `sub_test_${addon}`]);
      assert.equal((await allowed(addon)).allowed, true);
    }
    await app("bernay", "INSERT INTO crm_companies(id,restaurant_id,name) VALUES('test-company','bernay','Client test')");
    await app("bernay", "INSERT INTO crm_campaigns(id,restaurant_id,name,segment,subject,body,created_by) VALUES('test-campaign','bernay','Relance','new','Bonjour','Revenez nous voir','nadia')");
    assert.equal((await app("atelier", "SELECT id FROM crm_campaigns WHERE id='test-campaign'")).rows.length, 0);
    await assert.rejects(app("bernay", "UPDATE crm_campaigns SET status='sent' WHERE id='test-campaign'"));
    await app("bernay", "UPDATE crm_campaigns SET subject='Nouveau sujet' WHERE id='test-campaign'");
    assert.equal(((await app("bernay", "SELECT subject FROM crm_campaigns WHERE id='test-campaign'")).rows[0] as { subject: string }).subject, "Nouveau sujet");
    await app("bernay", "INSERT INTO crm_contacts(id,restaurant_id,company_id,name) VALUES('test-contact','bernay','test-company','Contact test')");
    await app("bernay", "INSERT INTO crm_opportunities(id,restaurant_id,company_id,title) VALUES('test-deal','bernay','test-company','Vente test')");
    await app("bernay", "INSERT INTO crm_opportunities(id,restaurant_id,company_id,title) VALUES('unsent-deal','bernay','test-company','Brouillon')");
    await assert.rejects(app("bernay", "UPDATE crm_opportunities SET proposal_status='sent' WHERE id='unsent-deal'"));
    await app("bernay", "INSERT INTO crm_inquiries(id,restaurant_id,company_id,opportunity_id,subject,body) VALUES('test-inquiry','bernay','test-company','test-deal','Premier contact','Besoin de renseignements')");
    await app("bernay", "INSERT INTO crm_proposal_deliveries(id,restaurant_id,opportunity_id,recipient,sent_by) VALUES('test-delivery','bernay','test-deal','client@example.test','nadia')");
    assert.equal((await app("atelier", "SELECT id FROM crm_proposal_deliveries WHERE id='test-delivery'")).rows.length, 0);
    assert.equal((await app("bernay", "UPDATE crm_opportunities SET proposal_status='sent' WHERE id='test-deal' AND proposal_status='sent' RETURNING id")).rows.length, 0);
    const publicInquiry = async (restaurant: string, email: string) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.restaurant_id',$1,true),set_config('app.public','true',true)", [restaurant]);
      return tx.query("SELECT app.crm_public_inquiry($1,$2,$3,$4,$5)", [restaurant, "Client test", email, "Question", "Bonjour"]);
    });
    await db.query("INSERT INTO customers(id,restaurant_id,name,contact,consent) VALUES('test-crm-customer','bernay','Client test','client@example.test',true)");
    await app("bernay", "INSERT INTO crm_customer_notes(id,restaurant_id,customer_id,body,author_id) VALUES('test-customer-note','bernay','test-crm-customer','Préférence interne','nadia')");
    await app("bernay", "INSERT INTO crm_customer_tags(restaurant_id,customer_id,tag) VALUES('bernay','test-crm-customer','VIP')");
    assert.equal((await app("atelier", "SELECT id FROM crm_customer_notes WHERE id='test-customer-note'")).rows.length, 0);
    assert.equal((await app("atelier", "SELECT tag FROM crm_customer_tags WHERE customer_id='test-crm-customer'")).rows.length, 0);
    await assert.rejects(app("atelier", "INSERT INTO crm_customer_tags(restaurant_id,customer_id,tag) VALUES('atelier','test-crm-customer','VIP')"));
    await assert.rejects(app("bernay", "UPDATE crm_customer_notes SET body='Modifiée' WHERE id='test-customer-note'"));
    await db.query("INSERT INTO customers(id,restaurant_id,name,contact,consent) VALUES('test-send-customer','bernay','Client destinataire','destinataire@example.test',true)");
    await db.query("INSERT INTO customers(id,restaurant_id,name,contact,consent) VALUES('zz-duplicate-customer','bernay','Client doublon','destinataire@example.test',true)");
    await app("bernay", "INSERT INTO customer_support_cases(id,restaurant_id,customer_id,category,subject,description,created_by) VALUES('test-case','bernay','test-crm-customer','question','Question test','Description test','nadia')");
    await app("bernay", "INSERT INTO customer_support_events(id,restaurant_id,case_id,kind,detail,actor_id) VALUES('test-case-event','bernay','test-case','note','Note interne','nadia')");
    assert.equal((await app("atelier", "SELECT id FROM customer_support_cases WHERE id='test-case'")).rows.length, 0);
    assert.equal((await app("atelier", "SELECT id FROM customer_support_events WHERE id='test-case-event'")).rows.length, 0);
    await assert.rejects(app("bernay", "UPDATE customer_support_events SET detail='Modifié' WHERE id='test-case-event'"));
    await assert.rejects(app("bernay", "INSERT INTO customer_support_cases(id,restaurant_id,customer_id,category,subject,description,created_by) VALUES('foreign-case','bernay','unknown-customer','question','Interdit','Description test','nadia')"));
    const segments = await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)");
      return crmSegmentStats(tx, "bernay");
    });
    assert.ok((segments.find((segment) => segment.segment === "new")?.email_eligible ?? 0) >= 1);
    assert.equal(segments.reduce((total, segment) => total + segment.customers, 0), Number(((await app("bernay", "SELECT count(*) AS total FROM customers WHERE restaurant_id='bernay'")).rows[0] as { total: string }).total));
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)");
      await prepareCampaignAudience(tx, "bernay", "test-campaign");
    });
    assert.equal(Number(((await app("bernay", "SELECT count(*) AS total FROM crm_campaign_recipients WHERE campaign_id='test-campaign'")).rows[0] as { total: string }).total), segments.find((segment) => segment.segment === "new")?.email_eligible);
    await db.query("UPDATE customers SET consent=false WHERE id='test-crm-customer'");
    const originalFetch = globalThis.fetch;
    const previousEnv = { database: process.env.DATABASE_URL, demo: process.env.ATACUISINE_DEMO, resend: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
    process.env.DATABASE_URL = "postgres://test.invalid/db";
    process.env.ATACUISINE_DEMO = "false";
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "sender@example.test";
    globalThis.fetch = async () => new Response(JSON.stringify({ id: "email-test" }), { status: 200, headers: { "Content-Type": "application/json" } });
    try {
      await db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)");
        for (let attempt = 0; attempt < 20; attempt++) {
          const pending = await tx.query<{ total: number }>("SELECT count(*)::int AS total FROM crm_campaign_recipients WHERE campaign_id='test-campaign' AND status='pending'");
          if (!pending.rows[0]?.total) break;
          await sendCampaignBatch(tx, "bernay", "test-campaign", "nadia");
        }
      });
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries({ DATABASE_URL: previousEnv.database, ATACUISINE_DEMO: previousEnv.demo, RESEND_API_KEY: previousEnv.resend, EMAIL_FROM: previousEnv.from })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
    assert.equal(((await app("bernay", "SELECT status FROM crm_campaign_recipients WHERE campaign_id='test-campaign' AND customer_id='test-crm-customer'")).rows[0] as { status: string }).status, "skipped");
    assert.equal((await app("bernay", "SELECT id FROM customer_messages WHERE customer_id='test-crm-customer' AND purpose='offre'")).rows.length, 0);
    assert.equal(((await app("bernay", "SELECT status FROM crm_campaign_recipients WHERE campaign_id='test-campaign' AND customer_id='test-send-customer'")).rows[0] as { status: string }).status, "sent");
    assert.equal((await app("bernay", "SELECT id FROM customer_messages WHERE customer_id='test-send-customer' AND purpose='offre'")).rows.length, 1);
    assert.equal((await app("bernay", "SELECT id FROM crm_campaign_recipients WHERE campaign_id='test-campaign' AND recipient='destinataire@example.test'")).rows.length, 1);
    assert.equal((await app("atelier", "SELECT id FROM crm_campaign_recipients WHERE campaign_id='test-campaign'")).rows.length, 0);
    assert.equal((await app("bernay", "UPDATE crm_campaigns SET subject='Impossible' WHERE id='test-campaign' AND status='draft' RETURNING id")).rows.length, 0);
    await app("bernay", "INSERT INTO crm_automation_settings(restaurant_id,inquiry_assignment_enabled,inquiry_assignee_id) VALUES('bernay',true,'nadia')");
    await publicInquiry("bernay", "client@example.test");
    assert.equal(((await app("bernay", "SELECT customer_id FROM crm_inquiries WHERE sender_email='client@example.test'")).rows[0] as { customer_id: string }).customer_id, "test-crm-customer");
    assert.equal(((await app("bernay", "SELECT assigned_to FROM crm_inquiries WHERE sender_email='client@example.test'")).rows[0] as { assigned_to: string }).assigned_to, "nadia");
    assert.equal(((await app("bernay", "SELECT assigned_to FROM crm_inquiries WHERE id='test-inquiry'")).rows[0] as { assigned_to: string | null }).assigned_to, null);
    await app("bernay", "UPDATE crm_automation_settings SET inquiry_assignment_enabled=false WHERE restaurant_id='bernay'");
    await app("bernay", "INSERT INTO crm_inquiries(id,restaurant_id,subject,body) VALUES('manual-unassigned','bernay','Nouvelle demande','Message')");
    assert.equal(((await app("bernay", "SELECT assigned_to FROM crm_inquiries WHERE id='manual-unassigned'")).rows[0] as { assigned_to: string | null }).assigned_to, null);
    assert.equal((await app("bernay", "UPDATE crm_inquiries SET assigned_to='nadia' WHERE id='test-inquiry' AND EXISTS (SELECT 1 FROM memberships WHERE restaurant_id='bernay' AND profile_id='nadia') RETURNING id")).rows.length, 1);
    await assert.rejects(publicInquiry("bernay", "client@example.test"));
    await assert.rejects(publicInquiry("atelier", "autre@example.test"));
    await app("bernay", "UPDATE crm_opportunities SET proposal_status='sent',follow_up_at=now()+interval '7 days' WHERE id='test-deal'");
    await app("bernay", "UPDATE crm_automation_settings SET proposal_followup_enabled=true,proposal_followup_days=4 WHERE restaurant_id='bernay'");
    assert.equal((await app("atelier", "SELECT restaurant_id FROM crm_automation_settings WHERE restaurant_id='bernay'")).rows.length, 0);
    assert.equal((await app("atelier", "UPDATE crm_automation_settings SET proposal_followup_days=1 WHERE restaurant_id='bernay' RETURNING restaurant_id")).rows.length, 0);
    await app("bernay", "INSERT INTO crm_opportunities(id,restaurant_id,company_id,title) VALUES('auto-deal','bernay','test-company','Proposition automatisée')");
    await app("bernay", "INSERT INTO crm_proposal_deliveries(id,restaurant_id,opportunity_id,recipient,sent_by) VALUES('auto-delivery','bernay','auto-deal','client@example.test','nadia')");
    await app("bernay", "UPDATE crm_opportunities SET proposal_status='sent' WHERE id='auto-deal'");
    const schedule = () => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id','bernay',true),set_config('app.public','false',true)");
      return scheduleProposalFollowup(tx, "bernay", "auto-deal", "nadia");
    });
    assert.equal(await schedule(), true);
    assert.equal(await schedule(), false);
    assert.equal((await app("bernay", "SELECT id FROM crm_activities WHERE automation_key='proposal-followup:auto-deal'")).rows.length, 1);
    assert.equal((await app("atelier", "SELECT id FROM crm_activities WHERE automation_key='proposal-followup:auto-deal'")).rows.length, 0);
    await db.query("INSERT INTO orders(id,restaurant_id,channel,status,created_at,idempotency_key,customer_name,contact) VALUES('checkout-open','bernay','takeaway','active',now()-interval '1 hour','checkout-open','Client test','client@example.test')");
    await db.query("INSERT INTO shop_orders(order_id,token,request_hash,consumption,payment_method,total,stripe_session) VALUES('checkout-open','token-checkout-open','hash','takeaway','stripe',2500,'cs_test_checkout_open')");
    await db.query("INSERT INTO orders(id,restaurant_id,channel,status,created_at,idempotency_key) VALUES('checkout-no-session','bernay','takeaway','active',now()-interval '1 hour','checkout-no-session')");
    await db.query("INSERT INTO shop_orders(order_id,token,request_hash,consumption,payment_method,total) VALUES('checkout-no-session','token-checkout-no-session','hash','takeaway','stripe',900)");
    const recovery = async (restaurant: string) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id',$1,true),set_config('app.public','false',true)", [restaurant]);
      return paymentRecoveryData(tx, restaurant);
    });
    assert.equal((await recovery("bernay")).summary.count, 1);
    assert.equal((await recovery("bernay")).summary.amount_cents, 2500);
    assert.equal((await recovery("atelier")).summary.count, 0);
    const followup = (restaurant: string, orderId: string, status: "reviewed" | "contacted") => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id',$1,true),set_config('app.public','false',true)", [restaurant]);
      return recordPaymentFollowup(tx, restaurant, { orderId, status, channel: status === "contacted" ? "phone" : null, note: "Appel noté" }, "nadia");
    });
    await followup("bernay", "checkout-open", "reviewed");
    await followup("bernay", "checkout-open", "contacted");
    await followup("bernay", "checkout-open", "reviewed");
    assert.equal(((await app("bernay", "SELECT status FROM crm_checkout_followups WHERE order_id='checkout-open'")).rows[0] as { status: string }).status, "contacted");
    assert.equal((await app("atelier", "SELECT order_id FROM crm_checkout_followups WHERE order_id='checkout-open'")).rows.length, 0);
    await assert.rejects(followup("bernay", "checkout-no-session", "contacted"));
    await assert.rejects(followup("atelier", "checkout-open", "contacted"));
    assert.equal(((await app("bernay", "SELECT proposal_status FROM crm_opportunities WHERE id='test-deal'")).rows[0] as { proposal_status: string }).proposal_status, "sent");
    await assert.rejects(app("bernay", "UPDATE crm_opportunities SET amount_cents=999 WHERE id='test-deal'"));
    await assert.rejects(app("bernay", "UPDATE crm_opportunities SET proposal_status='draft' WHERE id='test-deal'"));
    await app("bernay", "UPDATE crm_opportunities SET proposal_status='accepted' WHERE id='test-deal'");
    await assert.rejects(app("bernay", "UPDATE crm_opportunities SET proposal_status='declined' WHERE id='test-deal'"));
    assert.equal((await app("atelier", "SELECT id FROM crm_inquiries WHERE id='test-inquiry'")).rows.length, 0);
    await assert.rejects(app("bernay", "INSERT INTO crm_inquiries(id,restaurant_id,company_id,subject,body) VALUES('foreign-inquiry','bernay','other-company','Interdit','Mauvais commerce')"));
    await app("bernay", "INSERT INTO prospect_scans(id,restaurant_id,city,sector,radius_km) VALUES('test-scan','bernay','Paris','56.10A',10)");
    assert.equal((await app("bernay", "SELECT id FROM crm_companies WHERE id='test-company'")).rows.length, 1);
    assert.equal((await app("atelier", "SELECT id FROM crm_companies WHERE id='test-company'")).rows.length, 0);
    assert.equal((await app("atelier", "SELECT id FROM crm_contacts WHERE id='test-contact'")).rows.length, 0);
    assert.equal((await app("atelier", "SELECT id FROM prospect_scans WHERE id='test-scan'")).rows.length, 0);
    await assert.rejects(app("bernay", "INSERT INTO crm_opportunities(id,restaurant_id,company_id,title) VALUES('foreign','bernay','other-company','Interdit')"));
    await app("bernay", "SELECT app.addon_installation_set('bernay','pipeline-crm',false)");
    assert.equal((await allowed("pipeline-crm")).allowed, false);
    assert.equal((await app("bernay", "SELECT id FROM crm_companies WHERE id='test-company'")).rows.length, 0);
  } finally {
    await db.close();
  }
});
