import assert from "node:assert/strict";
import { PostgresDatabase } from "../src/lib/database/postgres";
import { withDatabaseContext } from "../src/lib/database/context";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { platformPerform } from "../src/features/platform/service";
import { offlinePerform } from "../src/features/offline/service";
import { changeItem, createOrder, pay } from "../src/features/orders/service";
import { financeAction, financeState } from "../src/features/finance/service";
import { commerce } from "../src/features/commerce/service";
import { billingAction, fecRows } from "../src/features/billing/service";
import { hrAction, hrState, payrollExport } from "../src/features/hr/service";
import {
  bankAction,
  bankState,
  importStatement,
} from "../src/features/bank/service";
import {
  invoiceAction,
  uploadInvoice,
  type Run as InvoiceRun,
} from "../src/features/invoices/service";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { financeDashboard } from "../src/features/finance/dashboard";
import { setStripeClient } from "../src/features/payments/config";
import {
  handleEvent,
  paymentAction,
  sendPayout,
  startCheckout,
  type MinimalEvent,
  type Run,
} from "../src/features/payments/service";
import { randomUUID } from "node:crypto";
const url = process.env.MIGRATION_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Base locale de vérification requise.");
if (process.env.CONFIRM_ISOLATED_DATABASE !== "true")
  throw new Error("CONFIRM_ISOLATED_DATABASE=true requis.");
const db = new PostgresDatabase(url);
async function app<T>(
  userId: string,
  restaurantId: string,
  fn: (tx: DB) => Promise<T>,
) {
  return withDatabaseContext({ userId, restaurantId }, () =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      return fn(tx);
    }),
  );
}
try {
  await db.transaction(seed);
  const user = { id: "nadia", name: "Nadia", role: "OWNER" as const };
  await db.query(
    "INSERT INTO profiles(id,name,role,email) VALUES('qa-other','QA Other','OWNER','qa-other@example.test')",
  );
  await withDatabaseContext({ userId: "qa-other" }, () =>
    db.query(
      "SELECT app.bootstrap_organization('qa-other-org','QA Other','qa-other-r','QA Other')",
    ),
  );
  assert.equal(
    (
      await app("nadia", "qa-other-r", (tx) =>
        rows(tx, "SELECT id FROM orders"),
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await app("nadia", "bernay", (tx) =>
        rows(tx, "SELECT id FROM restaurants WHERE id='qa-other-r'"),
      )
    ).length,
    0,
  );
  await assert.rejects(
    app("nadia", "bernay", (tx) =>
      tx.query(
        "INSERT INTO suppliers(id,restaurant_id,name) VALUES('qa-cross','qa-other-r','Forbidden')",
      ),
    ),
  );
  const flags = await app("nadia", "bernay", (tx) =>
    one<{ rolsuper: boolean; rolbypassrls: boolean; owns: boolean }>(
      tx,
      "SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT FROM pg_tables WHERE schemaname='public' AND tableowner=current_user) AS owns FROM pg_roles r WHERE rolname=current_user",
    ),
  );
  assert.deepEqual(flags, {
    rolsuper: false,
    rolbypassrls: false,
    owns: false,
  });
  const addRestaurant = (name: string) =>
    app("qa-other", "qa-other-r", (tx) =>
      platformPerform(
        tx,
        { id: "qa-other", name: "QA", role: "OWNER" },
        {
          action: "restaurant",
          organization: "qa-other-org",
          name,
        },
      ),
    );
  await assert.rejects(addRestaurant("En attente"), /avant activation/);
  await db.query("SELECT app.configure_organization_plan('qa-other-org',39,2)");
  await assert.rejects(
    app("qa-other", "qa-other-r", (tx) =>
      tx.query("SELECT app.configure_organization_plan('qa-other-org',39,3)"),
    ),
    /permission denied/,
  );
  const results = await Promise.allSettled([
    addRestaurant("Restaurant B"),
    addRestaurant("Restaurant C"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.match(
    String(results.find((result) => result.status === "rejected")?.reason),
    /Quota/,
  );
  const device = (await app("nadia", "bernay", (tx) =>
    offlinePerform(tx, "bernay", user, {
      action: "register",
      name: "QA Postgres",
    }),
  )) as { id: string };
  const quota = (await app("nadia", "bernay", (tx) =>
    offlinePerform(tx, "bernay", user, {
      action: "allocate",
      device: device.id,
      menu: "bernay-Plats-0",
      quantity: 2,
    }),
  )) as { id: string };
  const event = {
    id: randomUUID(),
    order: randomUUID(),
    kind: "order",
    items: [{ quota: quota.id, quantity: 1 }],
    // Heure de la base : celle de la machine de test peut retarder sur le conteneur.
    at: (await one<{ now: string }>(db, "SELECT now() AS now")).now,
  };
  for (let i = 0; i < 2; i++) {
    const result = (await app("nadia", "bernay", (tx) =>
      offlinePerform(tx, "bernay", user, {
        action: "sync",
        device: device.id,
        events: [event],
      }),
    )) as { results: { status: string; error?: string }[] };
    assert.equal(result.results[0].status, "applied", JSON.stringify(result));
  }
  assert.equal(
    (await rows(db, "SELECT id FROM orders WHERE id=$1", [event.order])).length,
    1,
  );
  await app("nadia", "bernay", (tx) =>
    offlinePerform(tx, "bernay", user, {
      action: "reconcile",
      device: device.id,
    }),
  );
  await assert.rejects(
    app("nadia", "bernay", (tx) =>
      tx.query("SELECT * FROM app.claim_jobs($1,'all')", ["forbidden"]),
    ),
  );
  // Socle financier : la salle règle sans lire les écritures, la finance les consulte.
  const finance = await app("nadia", "bernay", (tx) =>
    financeState(tx, "bernay", user),
  );
  await app("nadia", "bernay", (tx) =>
    financeAction(tx, "bernay", user, {
      action: "settings",
      vatRegime: "normal",
      cashAccount: finance.settings.cash_account,
      cardAccount: finance.settings.card_account,
      otherAccount: finance.settings.other_account,
      salesAccount: finance.settings.sales_account,
    }),
  );
  const dish = await one<{ id: string; price: number }>(
    db,
    "SELECT m.id,m.price FROM menu_items m WHERE m.restaurant_id='bernay' AND m.enabled AND m.price>0 AND m.archived_at IS NULL AND EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id) AND NOT EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id AND coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=r.ingredient_id AND l.expires_on>=CURRENT_DATE),0)<r.quantity) ORDER BY m.id LIMIT 1",
  );
  const ten = (finance.rates as { id: string; rate_bp: number }[]).find(
    (r) => r.rate_bp === 1000,
  )!;
  await app("nadia", "bernay", (tx) =>
    financeAction(tx, "bernay", user, {
      action: "productVat",
      menu: dish.id,
      onsite: ten.id,
      takeaway: ten.id,
    }),
  );
  const table = await one<{ id: string }>(
    db,
    "SELECT id FROM dining_tables t WHERE restaurant_id='bernay' AND status='free' AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.closed_at IS NULL) ORDER BY number LIMIT 1",
  );
  const sold = await app("nadia", "bernay", (tx) =>
    createOrder(
      tx,
      {
        restaurant: "bernay",
        table: table.id,
        channel: "staff",
        customer: "",
        contact: "",
        key: randomUUID(),
        items: [{ menu: dish.id, quantity: 1, note: "" }],
      },
      user,
    ),
  );
  const line = await one<{ id: string }>(
    db,
    "SELECT id FROM order_items WHERE order_id=$1",
    [sold],
  );
  for (const status of ["preparing", "ready", "served"])
    await app("nadia", "bernay", (tx) =>
      changeItem(tx, "bernay", line.id, status, user),
    );
  const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
  await app("sarah", "bernay", (tx) =>
    pay(tx, "bernay", sold, "card", waiter),
  );
  const posted = await rows<{ debit: number; credit: number }>(
    db,
    "SELECT l.debit,l.credit FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id JOIN fin_events e ON e.id=n.event_id JOIN payment_declarations p ON 'payment:'||p.id=e.dedupe_key JOIN orders o ON o.session_id=p.session_id WHERE o.id=$1",
    [sold],
  );
  assert.equal(
    posted.reduce((s, l) => s + l.debit, 0),
    dish.price,
  );
  assert.equal(
    posted.reduce((s, l) => s + l.credit, 0),
    dish.price,
  );
  assert.equal(
    (await app("sarah", "bernay", (tx) => rows(tx, "SELECT id FROM fin_entries")))
      .length,
    0,
  );
  assert.ok(
    (await app("nadia", "bernay", (tx) => rows(tx, "SELECT id FROM fin_entries")))
      .length > 0,
  );
  assert.equal(
    (
      await app("nadia", "qa-other-r", (tx) =>
        rows(tx, "SELECT id FROM fin_entries"),
      )
    ).length,
    0,
  );
  // L'application n'a aucun droit d'écriture sur le journal : le refus précède même la RLS.
  await assert.rejects(
    app("nadia", "bernay", (tx) =>
      tx.query("UPDATE fin_entries SET label='altérée'"),
    ),
    /permission denied/,
  );
  await assert.rejects(
    db.query("UPDATE fin_entries SET label='altérée'"),
    /ajout seul/,
  );
  await assert.rejects(
    app("nadia", "bernay", (tx) => tx.query("DELETE FROM payment_declarations")),
  );
  const chain = await app("nadia", "bernay", (tx) =>
    one<{ checked: number; broken_at: number | null }>(
      tx,
      "SELECT checked,broken_at FROM app.fin_verify_chain('bernay')",
    ),
  );
  assert.equal(chain.broken_at, null);
  assert.ok(chain.checked >= 1);
  // Tableau de bord : les chiffres du journal, sous le rôle applicatif ; salle refusée.
  const pilot = await app("nadia", "bernay", (tx) =>
    financeDashboard(tx, "bernay", user, { period: "year" }),
  );
  assert.ok(pilot.metrics.cash.value! >= dish.price);
  assert.equal(pilot.metrics.treasury.value, null);
  await assert.rejects(
    app("sarah", "bernay", (tx) =>
      financeDashboard(tx, "bernay", waiter, { period: "year" }),
    ),
  );
  // Factures fournisseurs : stockage local jetable, rôle applicatif réel.
  const invoiceDir = await mkdtemp(path.join(tmpdir(), "demo-invoices-"));
  process.env.ATACUISINE_DEMO = "true";
  process.env.ATACUISINE_DATA_DIR = invoiceDir;
  const appRun: InvoiceRun = (fn) => app("nadia", "bernay", fn);
  const deposited = await uploadInvoice(
    appRun,
    "bernay",
    user,
    Buffer.from(
      `<?xml version="1.0"?><Invoice xmlns:cbc="u" xmlns:cac="v"><cbc:ID>QA-1</cbc:ID><cbc:IssueDate>2026-11-02</cbc:IssueDate><cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Fournisseur QA</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty><cac:TaxTotal><cbc:TaxAmount>10.00</cbc:TaxAmount></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>100.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>110.00</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal></Invoice>`,
    ),
    "qa.xml",
  );
  assert.equal(deposited.source, "xml");
  await app("nadia", "bernay", (tx) =>
    invoiceAction(tx, "bernay", user, {
      action: "validate",
      id: deposited.id,
      supplierName: "Fournisseur QA",
      supplierVat: null,
      number: "QA-1",
      invoiceDate: "2026-11-02",
      dueDate: null,
      net: 10000,
      vat: 1000,
      gross: 11000,
      category: "merchandise",
    }),
  );
  await app("nadia", "bernay", (tx) =>
    invoiceAction(tx, "bernay", user, {
      action: "pay",
      id: deposited.id,
      paidOn: "2026-11-03",
      method: "bank",
    }),
  );
  assert.equal(
    (
      await app("sarah", "bernay", (tx) =>
        rows(tx, "SELECT id FROM fin_supplier_invoices"),
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await app("nadia", "qa-other-r", (tx) =>
        rows(tx, "SELECT id FROM fin_documents"),
      )
    ).length,
    0,
  );
  await assert.rejects(db.query("DELETE FROM fin_documents"));
  // Banque : import sous le rôle applicatif, doublon écarté, facture reliée, salle refusée.
  const bankAccount = (await app("nadia", "bernay", (tx) =>
    bankAction(tx, "bernay", user, {
      action: "account",
      label: "Compte QA",
      openingBalance: 100000,
      openingDate: "2026-10-31",
    }),
  )) as { id: string };
  const bankFile = Buffer.from("Date;Libellé;Montant\n05/11/2026;VIR FOURNISSEUR QA;-110,00\n");
  const imported = await importStatement(
    appRun,
    "bernay",
    user,
    bankAccount.id,
    bankFile,
    "qa.csv",
  );
  assert.equal(imported.added, 1);
  assert.equal(
    (
      await importStatement(
        appRun,
        "bernay",
        user,
        bankAccount.id,
        bankFile,
        "qa.csv",
      )
    ).duplicateFile,
    true,
  );
  const bank = await app("nadia", "bernay", (tx) =>
    bankState(tx, "bernay", user),
  );
  assert.equal(bank.accounts[0].balance, 89000);
  const link = bank.open[0].candidates.find((c) => c.kind === "invoice_link")!;
  await app("nadia", "bernay", (tx) =>
    bankAction(tx, "bernay", user, {
      action: "match",
      id: bank.open[0].id,
      kind: "invoice_link",
      targets: link.targets,
    }),
  );
  assert.equal(
    (
      await app("sarah", "bernay", (tx) =>
        rows(tx, "SELECT id FROM fin_bank_transactions"),
      )
    ).length,
    0,
  );
  await assert.rejects(db.query("DELETE FROM fin_bank_transactions"));
  // RH : heures, contrat, clôture et export sous le rôle applicatif ; salle refusée.
  await db.query(
    "INSERT INTO time_entries(id,restaurant_id,profile_id,event,created_at) VALUES($1,'bernay','sarah','start','2026-03-03T08:00:00Z'),($2,'bernay','sarah','end','2026-03-03T16:00:00Z')",
    [randomUUID(), randomUUID()],
  );
  await app("nadia", "bernay", (tx) =>
    hrAction(tx, "bernay", user, {
      action: "contract",
      profile: "sarah",
      kind: "cdi",
      weeklyMinutes: 2100,
      hourlyRate: 1200,
      from: "2026-01-01",
      to: null,
    }),
  );
  await app("nadia", "bernay", (tx) =>
    hrAction(tx, "bernay", user, {
      action: "rules",
      baseMinutes: 2100,
      band1Until: 2340,
      band2Until: 2580,
      band1RateBp: 1000,
      band2RateBp: 2000,
      band3RateBp: 5000,
      employerRateBp: null,
      confirmed: true,
    }),
  );
  const payrollState = await app("nadia", "bernay", (tx) =>
    hrState(tx, "bernay", user, "2026-03"),
  );
  assert.equal(payrollState.cost?.gross, 8 * 1200);
  await app("nadia", "bernay", (tx) =>
    hrAction(tx, "bernay", user, { action: "close", month: "2026-03" }),
  );
  assert.match(
    await app("nadia", "bernay", (tx) =>
      payrollExport(tx, "bernay", user, "2026-03"),
    ),
    /"Sarah";"8,00"/,
  );
  await assert.rejects(
    app("sarah", "bernay", (tx) =>
      hrState(tx, "bernay", { id: "sarah", name: "Sarah", role: "WAITER" }, "2026-03"),
    ),
  );
  assert.equal(
    (await app("sarah", "bernay", (tx) => rows(tx, "SELECT id FROM hr_contracts")))
      .length,
    0,
  );
  // Factures clients : numéro continu sous le rôle applicatif, facture figée, salle refusée.
  await app("nadia", "bernay", (tx) =>
    billingAction(tx, "bernay", user, {
      action: "company",
      legalName: "Société QA",
      legalForm: "",
      address: "1 rue de test, Paris",
      siren: "123456789",
      vatNumber: "FR00123456789",
      shareCapital: "",
      rcs: "",
      paymentDays: 30,
      latePenalty: "Pénalités légales et indemnité de 40 €.",
    }),
  );
  const makeInvoice = async () => {
    const { id } = (await app("nadia", "bernay", (tx) =>
      billingAction(tx, "bernay", user, {
        action: "draft",
        customerName: "Client QA",
        customerAddress: "",
        customerSiren: null,
        customerVat: null,
        isBusiness: false,
        note: "",
        serviceDate: "2026-11-01",
        lines: [{ label: "Repas", quantity: 2, unitGross: 1100, rateId: ten.id }],
      }),
    )) as { id: string };
    const { number } = (await app("nadia", "bernay", (tx) =>
      billingAction(tx, "bernay", user, { action: "issue", id }),
    )) as { number: string };
    return { id, number };
  };
  const firstInvoice = await makeInvoice();
  const secondInvoice = await makeInvoice();
  assert.match(firstInvoice.number, /^F-\d{4}-000001$/);
  assert.match(secondInvoice.number, /^F-\d{4}-000002$/);
  assert.equal(
    (
      await app("nadia", "bernay", (tx) =>
        tx.query("UPDATE fin_invoices SET customer_name='Autre' WHERE status='draft'"),
      )
    ).affectedRows,
    0,
  );
  await assert.rejects(
    app("nadia", "bernay", (tx) =>
      tx.query("UPDATE fin_invoices SET customer_name='Autre' WHERE id=$1", [
        firstInvoice.id,
      ]),
    ),
  );
  assert.equal(
    (await app("sarah", "bernay", (tx) => rows(tx, "SELECT id FROM fin_invoices")))
      .length,
    0,
  );
  const fec = await app("nadia", "bernay", (tx) =>
    fecRows(tx, "bernay", user, "2020-01-01", "2099-12-31"),
  );
  assert.equal(
    fec.reduce((s, l) => s + l.debit, 0),
    fec.reduce((s, l) => s + l.credit, 0),
  );
  await rm(invoiceDir, { recursive: true, force: true });
  delete process.env.ATACUISINE_DEMO;
  delete process.env.ATACUISINE_DATA_DIR;
  // Paiement en ligne, Stripe simulé : rôle public, rôle web et rôle worker réels.
  process.env.STRIPE_SECRET_KEY = "sk_test_simule";
  setStripeClient({
    checkout: {
      sessions: {
        create: async (p: { client_reference_id: string }) => ({
          id: `cs_${p.client_reference_id}`,
          url: "https://stripe.test/pay",
        }),
      },
    },
    paymentIntents: {
      retrieve: async () => ({
        latest_charge: { outcome: { risk_level: "normal" } },
      }),
    },
    transfers: { create: async () => ({ id: `tr_${randomUUID()}` }) },
    v2: {
      core: {
        accounts: {
          retrieve: async () => ({
            configuration: {
              recipient: {
                capabilities: {
                  stripe_balance: { stripe_transfers: { status: "active" } },
                },
              },
            },
          }),
        },
      },
    },
  });
  await db.query(
    "INSERT INTO connect_accounts(restaurant_id,stripe_account_id,status) VALUES('bernay','acct_qa','active')",
  );
  const asRole =
    (role: string, userId: string, isPublic: boolean): Run =>
    (fn) =>
      withDatabaseContext(
        { userId, restaurantId: "bernay", public: isPublic },
        () =>
          db.transaction(async (tx) => {
            await tx.exec(`SET LOCAL ROLE ${role}`);
            return fn(tx);
          }),
      );
  const visitor = asRole("atacuisine_app", "", true),
    owner = asRole("atacuisine_app", "nadia", false),
    jobs = asRole("atacuisine_worker", "", true);
  const shop = commerce("bernay");
  await shop.updateSettings(db, user, {
    open: true,
    prepMinutes: 5,
    interval: 5,
    capacity: 50,
    hours: Array.from({ length: 7 }, (_, day) => ({
      day,
      open: "00:00",
      close: "23:59",
    })),
    categories: ["Entrées", "Plats", "Desserts", "Boissons"],
    address: "QA",
    phone: "",
    logo: "",
  });
  const slot = (await shop.slots(db))[0];
  const placed = await visitor((tx) =>
    shop.checkout(tx, {
      key: randomUUID(),
      customer: "Client QA",
      email: "qa@example.test",
      consumption: "takeaway",
      payment: "stripe",
      termsAccepted: true,
      slot,
      items: [{ menu: dish.id, quantity: 1, choices: [], note: "" }],
    }),
  );
  await startCheckout(visitor, "bernay", {
    token: placed.token,
    path: "/r/bernay/boutique",
  });
  await handleEvent(jobs, "bernay", {
    id: "evt_qa",
    type: "checkout.session.completed",
    object: {
      id: `cs_${placed.order_id}`,
      payment_status: "paid",
      payment_intent: `pi_${placed.order_id}`,
      amount_total: dish.price,
    },
  } as unknown as MinimalEvent);
  await assert.rejects(
    owner((tx) =>
      tx.query("SELECT app.fin_post_transfer('bernay','x','payout.sent','x',1,'payout','x','[]')"),
    ),
  );
  assert.equal(
    (
      await owner((tx) =>
        tx.query("UPDATE online_payments SET available_at=now()-interval '1 day'"),
      )
    ).affectedRows,
    0,
  );
  await db.query(
    "UPDATE online_payments SET available_at=now()-interval '1 minute' WHERE order_id=$1",
    [placed.order_id],
  );
  const released = (await paymentAction(owner, "bernay", user, {
    action: "request",
  })) as { payout: string };
  await sendPayout(jobs, "bernay", released.payout);
  assert.equal(
    (
      await one<{ status: string }>(
        db,
        "SELECT status FROM online_payouts WHERE id=$1",
        [released.payout],
      )
    ).status,
    "sent",
  );
  setStripeClient(undefined);
  delete process.env.STRIPE_SECRET_KEY;
  await db.query("UPDATE app.organization_plans SET plan=39 WHERE organization_id='qa-other-org'");
  await app("qa-other", "qa-other-r", (tx) =>
    tx.query("SELECT app.request_module_state('qa-other-r','table-booking','suspended',0)"),
  );
  await app("qa-other", "qa-other-r", (tx) =>
    tx.query("SELECT app.apply_module_state('qa-other-r','table-booking',1)"),
  );
  assert.equal(
    (await app("qa-other", "qa-other-r", (tx) => one<{ allowed:boolean }>(tx,"SELECT app.module_enabled('qa-other-r','table-booking') AS allowed"))).allowed,
    false,
  );
  assert.equal(
    (await app("nadia", "bernay", (tx) => one<{ allowed:boolean }>(tx,"SELECT app.module_enabled('bernay','table-booking') AS allowed"))).allowed,
    true,
  );
  await assert.rejects(
    app("nadia", "bernay", (tx) => tx.query("SELECT app.addon_reconcile('x','x','x','active',now())")),
    /permission denied/,
  );
  console.log(
    "PostgreSQL réel : migrations, RLS non propriétaire, refus croisés, modules par établissement, facturation protégée, commandes, finance, paiements, banque et RH vérifiés.",
  );
} finally {
  await db.close();
}
