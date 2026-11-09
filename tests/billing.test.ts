import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PDFDocument } from "pdf-lib";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { withDatabaseContext } from "../src/lib/database/context";
import { financeAction, financeState } from "../src/features/finance/service";
import { financeDashboard } from "../src/features/finance/dashboard";
import { financeIntent, financeReply } from "../src/features/assistant/finance";
import { parseInvoiceXml } from "../src/features/invoices/structured";
import { bankAction, bankState, importStatement, type Run } from "../src/features/bank/service";
import {
  billingAction,
  billingActionSchema,
  billingState,
  documentData,
  fecRows,
  receivables,
  taxSummary,
} from "../src/features/billing/service";
import { fecFile, invoicePdf, invoiceXml, unitNet } from "../src/features/billing/documents";

const R = "bernay";
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
let db: PGlite;
let dir: string;
let ten = "";
let twenty = "";

const run = (userId: string, isPublic = false): Run => (fn) =>
  withDatabaseContext({ userId, restaurantId: R, public: isPublic }, () =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true)",
        [userId, R, String(isPublic)],
      );
      return fn(tx);
    }),
  ) as never;
const web = run("nadia");
const act = async (a: Record<string, unknown>) => {
  const parsed = billingActionSchema.parse(a);
  return web((tx) => billingAction(tx, R, owner, parsed)) as unknown as Promise<{ id: string; number: string; payment: string; toRefund: number }>;
};
const company = {
  action: "company",
  legalName: "Studio Restau",
  legalForm: "SARL",
  address: "1 rue de la Paix, 75002 Paris",
  siren: "123456789",
  vatNumber: "FR12123456789",
  shareCapital: "10 000 €",
  rcs: "RCS Paris 123 456 789",
  paymentDays: 30,
  latePenalty: "Pénalités de retard : trois fois le taux légal, et indemnité forfaitaire de 40 €.",
};
const draft = async (over: Record<string, unknown> = {}, lines?: unknown[]) =>
  (await act({
    action: "draft",
    customerName: "Société Dupont",
    customerAddress: "2 rue Haute, 75001 Paris",
    customerSiren: "987654321",
    isBusiness: true,
    serviceDate: "2026-11-01",
    lines: lines ?? [{ label: "Repas d’équipe", quantity: 10, unitGross: 2200, rateId: ten }],
    ...over,
  })).id as string;
const entriesOf = (key: string) =>
  rows<{ kind: string; journal: string; account_code: string; debit: number; credit: number }>(
    db,
    "SELECT n.kind,n.journal,l.account_code,l.debit,l.credit FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id JOIN fin_events e ON e.id=n.event_id WHERE e.dedupe_key=$1 ORDER BY n.number,l.line_no",
    [key],
  );
const invoiceOf = (id: string) =>
  web((tx) => billingState(tx, R, owner)).then((s) => s.invoices.find((i) => i.id === id)!);
const year = new Date().getFullYear();

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "demo-billing-"));
  process.env.ATACUISINE_DATA_DIR = dir;
  process.env.ATACUISINE_DEMO = "true";
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  const view = await db.transaction((tx) => financeState(tx, R, owner));
  const rates = view.rates as { id: string; rate_bp: number }[];
  ten = rates.find((r) => r.rate_bp === 1000)!.id;
  twenty = rates.find((r) => r.rate_bp === 2000)!.id;
});
after(async () => {
  delete process.env.ATACUISINE_DATA_DIR;
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

test("calcul : TVA par taux, somme exacte", () => {
  const t = taxSummary([{ line_gross: 1100, rate_bp: 1000 }, { line_gross: 1200, rate_bp: 2000 }, { line_gross: -110, rate_bp: 1000 }]);
  assert.deepEqual(t.taxes, [{ rate_bp: 1000, net: 900, vat: 90 }, { rate_bp: 2000, net: 1000, vat: 200 }]);
  assert.equal(t.net + t.vat, t.gross);
  assert.equal(t.gross, 2190);
});

test("préalables : régime de TVA et identité exigés avant d’émettre", async () => {
  await assert.rejects(draft(), /régime de TVA/);
  const s = (await db.transaction((tx) => financeState(tx, R, owner))).settings;
  await db.transaction((tx) =>
    financeAction(tx, R, owner, { action: "settings", vatRegime: "normal", cashAccount: s.cash_account, cardAccount: s.card_account, otherAccount: s.other_account, salesAccount: s.sales_account }),
  );
  const id = await draft();
  await assert.rejects(act({ action: "issue", id }), /identité/);
  await assert.rejects(act({ ...company, siren: "12" }));
  await act({ ...company, vatNumber: null });
  await assert.rejects(act({ action: "issue", id }), /numéro de TVA/);
  await act(company);
  await assert.rejects(draft({}, [{ label: "Sans taux", quantity: 1, unitGross: 100, rateId: null }]), /Taux de TVA à préciser/);
  const noSiren = await draft({ customerSiren: null });
  await assert.rejects(act({ action: "issue", id: noSiren }), /SIREN/);
  await act({ action: "discard", id: noSiren });
  await act({ action: "discard", id });
});

test("émission : numéro continu, écriture client, facture figée", async () => {
  const a = await draft();
  assert.equal((await invoiceOf(a)).number, null, "un brouillon n’a pas de numéro");
  await assert.rejects(web((tx) => documentData(tx, R, owner, a)), /Émettez/);
  const first = await act({ action: "issue", id: a });
  assert.equal(first.number, `F-${year}-000001`);
  const b = await draft();
  // Échec de transaction : le numéro n’est pas perdu.
  await assert.rejects(
    web(async (tx) => {
      await billingAction(tx, R, owner, billingActionSchema.parse({ action: "issue", id: b }));
      throw new Error("panne");
    }),
    /panne/,
  );
  assert.equal((await act({ action: "issue", id: b })).number, `F-${year}-000002`);
  assert.deepEqual(
    (await entriesOf(`sale-invoice:${a}`)).map((e) => [e.account_code, Number(e.debit), Number(e.credit)]),
    [["411", 22000, 0], ["70710", 0, 20000], ["445711", 0, 2000]],
  );
  await assert.rejects(act({ action: "issue", id: a }), /déjà été traitée/);
  await assert.rejects(act({ action: "discard", id: a }), /avoir/);
  await assert.rejects(db.query("UPDATE fin_invoices SET gross=1,net=1,vat=0 WHERE id=$1", [a]), /ajout seul/);
  await assert.rejects(db.query("UPDATE fin_invoices SET customer_name='Autre' WHERE id=$1", [a]), /ajout seul/);
  await assert.rejects(db.query("DELETE FROM fin_invoices WHERE id=$1", [a]), /ajout seul/);
  await assert.rejects(db.query("UPDATE fin_invoice_lines SET line_gross=1 WHERE invoice_id=$1", [a]), /ajout seul/);
  await assert.rejects(db.query("DELETE FROM fin_invoice_lines WHERE invoice_id=$1", [a]), /ajout seul/);
  await assert.rejects(db.query("UPDATE fin_invoices SET number=$2 WHERE id=$1", [b, `F-${year}-000001`]));
  // L’identité de l’établissement reste celle de l’émission, même si elle change ensuite.
  await act({ ...company, legalName: "Nouveau nom" });
  assert.equal((await web((tx) => documentData(tx, R, owner, a))).company.legal_name, "Studio Restau");
  await act(company);
});

test("règlements : partiel puis solde, jamais au-delà, écritures justes", async () => {
  const id = await draft();
  await act({ action: "issue", id });
  await assert.rejects(act({ action: "pay", id, amount: 22001, paidOn: "2026-11-05", method: "bank" }), /dépasse/);
  const first = await act({ action: "pay", id, amount: 2000, paidOn: "2026-11-05", method: "bank" });
  assert.equal((await invoiceOf(id)).status, "issued");
  assert.equal((await invoiceOf(id)).due, 20000);
  await act({ action: "pay", id, amount: 20000, paidOn: "2026-11-06", method: "cash" });
  assert.equal((await invoiceOf(id)).status, "paid");
  assert.deepEqual(
    (await entriesOf(`sale-invoice-paid:${first.payment}`)).map((e) => [e.journal, e.account_code, Number(e.debit), Number(e.credit)]),
    [["BQ", "512", 2000, 0], ["BQ", "411", 0, 2000]],
  );
  await assert.rejects(act({ action: "pay", id, amount: 1, paidOn: "2026-11-06", method: "cash" }), /Rien à régler/);
});

test("avoir sur facture impayée : solde la créance, rien à rembourser", async () => {
  const id = await draft();
  await act({ action: "issue", id });
  const credit = await act({ action: "credit", id, note: "Erreur de quantité" });
  assert.equal(credit.number.slice(0, 2), "AV");
  assert.equal(credit.toRefund, 0);
  assert.equal((await invoiceOf(id)).status, "paid");
  assert.equal((await invoiceOf(credit.id)).status, "paid");
  assert.deepEqual(
    (await entriesOf(`sale-credit_note:${credit.id}`)).map((e) => [e.account_code, Number(e.debit), Number(e.credit)]),
    [["411", 0, 22000], ["70710", 20000, 0], ["445711", 2000, 0]],
  );
  await assert.rejects(act({ action: "credit", id }), /entièrement créditée/);
});

test("avoir partiel : quantités limitées, reste dû recalculé", async () => {
  const id = await draft();
  await act({ action: "issue", id });
  await assert.rejects(act({ action: "credit", id, lines: [{ line: 1, quantity: 11 }] }), /trop élevée/);
  await assert.rejects(act({ action: "credit", id, lines: [{ line: 9, quantity: 1 }] }), /inconnue/);
  const partial = await act({ action: "credit", id, lines: [{ line: 1, quantity: 4 }] });
  assert.equal(partial.toRefund, 0);
  assert.equal((await invoiceOf(id)).due, 22000 - 8800);
  await assert.rejects(act({ action: "credit", id, lines: [{ line: 1, quantity: 7 }] }), /trop élevée/);
  await act({ action: "pay", id, amount: 13200, paidOn: "2026-11-07", method: "bank" });
  assert.equal((await invoiceOf(id)).status, "paid");
});

test("avoir sur facture payée : le remboursement reste à enregistrer", async () => {
  const id = await draft();
  await act({ action: "issue", id });
  await act({ action: "pay", id, amount: 22000, paidOn: "2026-11-05", method: "bank" });
  const credit = await act({ action: "credit", id });
  assert.equal(credit.toRefund, 22000);
  assert.equal((await invoiceOf(credit.id)).due, 22000);
  const refund = await act({ action: "pay", id: credit.id, amount: 22000, paidOn: "2026-11-08", method: "bank" });
  assert.equal((await invoiceOf(credit.id)).status, "paid");
  assert.deepEqual(
    (await entriesOf(`sale-invoice-paid:${refund.payment}`)).map((e) => [e.account_code, Number(e.debit), Number(e.credit)]),
    [["411", 22000, 0], ["512", 0, 22000]],
  );
});

test("vente encaissée : facturée sans seconde écriture, une seule fois", async () => {
  await db.query("INSERT INTO orders(id,restaurant_id,channel,status,idempotency_key) VALUES('bill-o',$1,'takeaway','paid','bill-o')", [R]);
  const menu = await one<{ id: string }>(db, "SELECT id FROM menu_items WHERE restaurant_id=$1 LIMIT 1", [R]);
  await db.query("INSERT INTO order_items(id,order_id,menu_id,name,price,quantity,station,status,vat_rate_id,vat_rate_bp) VALUES('bill-i1','bill-o',$1,'Plat',1100,2,'kitchen','served',$2,1000),('bill-i2','bill-o',$1,'Vin',1200,1,'bar','served',$3,2000)", [menu.id, ten, twenty]);
  await db.query("INSERT INTO payment_declarations(id,order_id,amount,method,actor,discount) VALUES('bill-p','bill-o',3300,'card','nadia',100)");
  const before = await one<{ n: number }>(db, "SELECT count(*)::int AS n FROM fin_entries WHERE restaurant_id=$1 AND kind IN ('sale_invoice','sale_payment')", [R]);
  const made = await act({ action: "fromPayment", paymentId: "bill-p", customerName: "Client de passage" });
  const doc = await web((tx) => documentData(tx, R, owner, made.id));
  assert.equal(doc.gross, 3300);
  assert.equal(doc.paid, true);
  assert.equal(doc.due_date, null);
  assert.ok(doc.lines.some((l) => l.label === "Remise"), "la remise figure sur la facture");
  assert.deepEqual(doc.taxes.map((t) => t.rate_bp), [1000, 2000]);
  const after = await one<{ n: number }>(db, "SELECT count(*)::int AS n FROM fin_entries WHERE restaurant_id=$1 AND kind IN ('sale_invoice','sale_payment')", [R]);
  assert.equal(after.n, before.n, "aucune écriture de vente supplémentaire");
  await assert.rejects(act({ action: "fromPayment", paymentId: "bill-p", customerName: "Encore" }), /déjà sa facture/);
  assert.ok(!(await web((tx) => billingState(tx, R, owner))).payments.some((p) => (p as { id: string }).id === "bill-p"));
  await db.query("INSERT INTO orders(id,restaurant_id,channel,status,idempotency_key) VALUES('bill-o2',$1,'takeaway','paid','bill-o2')", [R]);
  await db.query("INSERT INTO order_items(id,order_id,menu_id,name,price,quantity,station,status) VALUES('bill-i3','bill-o2',$1,'Sans TVA',500,1,'kitchen','served')", [menu.id]);
  await db.query("INSERT INTO payment_declarations(id,order_id,amount,method,actor) VALUES('bill-p2','bill-o2',500,'cash','nadia')");
  await assert.rejects(act({ action: "fromPayment", paymentId: "bill-p2", customerName: "X" }), /Précisez/);
  await assert.rejects(act({ action: "fromPayment", paymentId: "inconnu", customerName: "X" }), /introuvable/);
});

test("documents : PDF lisible, XML structuré relu, caractères spéciaux sans danger", async () => {
  const id = await draft({ customerName: "Café <Müller> & Fils 中" });
  await act({ action: "issue", id });
  const doc = await web((tx) => documentData(tx, R, owner, id));
  const pdf = await invoicePdf(doc);
  const loaded = await PDFDocument.load(pdf);
  assert.equal(loaded.getPageCount(), 1);
  assert.equal(loaded.getTitle(), doc.number);
  // Une longue facture passe sur plusieurs pages sans erreur.
  const long = { ...doc, lines: Array.from({ length: 90 }, (_, n) => ({ ...doc.lines[0], label: `Ligne ${n} ${"très longue désignation ".repeat(6)}` })) };
  assert.ok((await PDFDocument.load(await invoicePdf(long))).getPageCount() > 1);
  const xml = invoiceXml(doc);
  assert.ok(xml.includes("Café &lt;Müller&gt; &amp; Fils"));
  const read = parseInvoiceXml(xml)!;
  assert.equal(read.number, doc.number);
  assert.deepEqual([read.net, read.vat, read.gross], [doc.net, doc.vat, doc.gross]);
  assert.equal(read.supplierName, "Studio Restau");
  assert.equal(read.supplierVat, "FR12123456789");
  assert.equal(read.invoiceDate, doc.issue_date);
  assert.match(invoiceXml({ ...doc, kind: "credit_note" }), /<ram:TypeCode>381/);
});

test("franchise : mention légale, pas de TVA", async () => {
  const s = (await db.transaction((tx) => financeState(tx, R, owner))).settings;
  const set = (vatRegime: "normal" | "franchise") =>
    db.transaction((tx) => financeAction(tx, R, owner, { action: "settings", vatRegime, cashAccount: s.cash_account, cardAccount: s.card_account, otherAccount: s.other_account, salesAccount: s.sales_account }));
  await set("franchise");
  const id = await draft({}, [{ label: "Repas", quantity: 1, unitGross: 5000, rateId: null }]);
  await act({ action: "issue", id });
  assert.deepEqual((await entriesOf(`sale-invoice:${id}`)).map((e) => e.account_code), ["411", "707"]);
  const doc = await web((tx) => documentData(tx, R, owner, id));
  assert.equal(doc.vat, 0);
  assert.ok((await invoicePdf(doc)).length > 0);
  await set("normal");
});

test("banque : le virement solde la facture, annulable, jamais une nouvelle vente", async () => {
  const id = await draft({ customerName: "Traiteur Lambert" });
  const issued = await act({ action: "issue", id });
  const account = (await web((tx) => bankAction(tx, R, owner, { action: "account", label: "Compte", openingBalance: 0, openingDate: "2026-10-31" }))) as { id: string };
  const paris = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris" }).format(new Date());
  await importStatement(web, R, owner, account.id, Buffer.from(`Date;Libellé;Montant\n${paris};VIR TRAITEUR LAMBERT;220,00\n`), "r.csv");
  const t = (await web((tx) => bankState(tx, R, owner))).open.find((x) => x.label.includes("LAMBERT"))!;
  const c = t.candidates.find((x) => x.kind === "customer_invoice")!;
  assert.equal(c.confidence, "high");
  assert.ok(c.label.includes(issued.number));
  await web((tx) => bankAction(tx, R, owner, { action: "match", id: t.id, kind: "customer_invoice", targets: c.targets }));
  assert.equal((await invoiceOf(id)).status, "paid");
  await web((tx) => bankAction(tx, R, owner, { action: "undo", id: t.id, reason: "Mauvais rapprochement" }));
  assert.equal((await invoiceOf(id)).status, "issued");
  assert.equal((await invoiceOf(id)).due, 22000);
  const again = (await web((tx) => bankState(tx, R, owner))).open.find((x) => x.id === t.id)!;
  assert.ok(again.candidates.some((x) => x.kind === "customer_invoice"));
});

test("le prix unitaire affiché est hors TVA", () => {
  assert.equal(unitNet(2500, 1000), 2273);
  assert.equal(unitNet(1200, 2000), 1000);
  assert.equal(unitNet(1000, 0), 1000);
});

test("export FEC : 18 colonnes, équilibré, sans séparateur parasite", async () => {
  const rowsFec = await web((tx) => fecRows(tx, R, owner, "2020-01-01", "2099-12-31"));
  assert.ok(rowsFec.length > 0);
  const file = fecFile(rowsFec);
  const lines = file.trim().split("\r\n");
  assert.equal(lines[0].split("|").length, 18);
  assert.equal(lines[0].split("|")[0], "JournalCode");
  for (const line of lines.slice(1)) assert.equal(line.split("|").length, 18);
  const total = (k: "debit" | "credit") => rowsFec.reduce((s, r) => s + r[k], 0);
  assert.equal(total("debit"), total("credit"));
  assert.ok(new Set(rowsFec.map((r) => r.journal)).has("VE"));
  assert.match(lines[1], /^[A-Z]{2}\|[^|]+\|\d+\|\d{8}\|/);
  // La pièce se retrouve par son numéro, pas par un identifiant interne.
  const invoiceRows = rowsFec.filter((r) => r.account_code === "411");
  assert.ok(invoiceRows.length > 0);
  for (const row of invoiceRows) assert.match(row.piece, /^(F|AV)-\d{4}-\d+$/);
  assert.equal(fecFile([{ journal: "VE", number: 1, entry_date: "2026-01-02", account_code: "411", account_label: "A|B", piece: "p", label: "x\ny", debit: 12345, credit: 0 }]).split("\r\n")[1], "VE|Ventes|1|20260102|411|A B|||p|20260102|x y|123,45|0,00|||20260102||");
  const chain = await one<{ broken_at: number | null }>(db, "SELECT broken_at FROM app.fin_verify_chain($1)", [R]);
  assert.equal(chain.broken_at, null);
});

test("tableau de bord et assistant : créances et chiffre d’affaires des factures", async () => {
  const owed = await web((tx) => receivables(tx, R));
  assert.ok(owed.total > 0);
  const d = await web((tx) => financeDashboard(tx, R, owner, { period: "year" }));
  assert.equal(d.metrics.receivables.value, owed.total);
  assert.ok(d.metrics.revenue.value! > 0);
  assert.equal(financeIntent("Quelles factures clients restent impayées ?"), "receivables");
  assert.equal(financeIntent("Quels clients sont en retard de paiement ?"), "receivables");
  assert.equal(financeIntent("Quelles factures restent impayées ?"), "invoices");
  assert.match(financeReply("receivables", d), /à encaisser/);
});

test("droits : salle, public et autre établissement sans accès", async () => {
  const salle = run("sarah");
  const visitor = run("", true);
  const invoice = await one<{ id: string }>(db, "SELECT id FROM fin_invoices WHERE number IS NOT NULL LIMIT 1");
  await assert.rejects(salle((tx) => billingState(tx, R, waiter)), /refusé/);
  await assert.rejects(salle((tx) => documentData(tx, R, waiter, invoice.id)), /refusé/);
  await assert.rejects(salle((tx) => fecRows(tx, R, waiter, "2026-01-01", "2026-12-31")), /refusé/);
  await assert.rejects(salle((tx) => billingAction(tx, R, waiter, billingActionSchema.parse({ action: "issue", id: invoice.id }))), /refusé/);
  for (const table of ["fin_company", "fin_invoices", "fin_invoice_lines", "fin_invoice_payments", "fin_invoice_sequences"]) {
    assert.equal((await salle((tx: DB) => rows(tx, `SELECT * FROM ${table}`))).length, 0, table);
    assert.equal((await visitor((tx: DB) => rows(tx, `SELECT * FROM ${table}`))).length, 0, table);
  }
  await db.query("INSERT INTO profiles(id,name,role,email) VALUES('bill-x','Autre','OWNER','x@example.test') ON CONFLICT DO NOTHING");
  await db.query("SELECT set_config('app.user_id','bill-x',false)");
  await db.query("SELECT app.bootstrap_organization('bill-org','Autre','bill-r','Autre')");
  await db.query("SELECT set_config('app.user_id','',false)");
  await db.query("UPDATE app.organization_plans SET plan=99 WHERE organization_id='bill-org'");
  const other = { id: "bill-x", name: "Autre", role: "OWNER" as const };
  await assert.rejects(
    withDatabaseContext({ userId: "bill-x", restaurantId: "bill-r" }, () =>
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        await tx.query("SELECT set_config('app.user_id','bill-x',true),set_config('app.restaurant_id','bill-r',true),set_config('app.public','false',true)");
        return documentData(tx, "bill-r", other, invoice.id);
      }),
    ),
    /introuvable|add-on n’est pas actif/,
  );
});

test("migration : descente refusée avec des factures, puis cycle complet à vide", async () => {
  await assert.rejects(db.exec(await readFile("database/migrations/down/041_sales_invoices.sql", "utf8")), /Retour arrière refusé/);
  const scratch = new PGlite();
  try {
    await scratch.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(scratch);
    await scratch.exec(await readFile("database/migrations/down/041_sales_invoices.sql", "utf8"));
    assert.equal((await scratch.query<{ t: string | null }>("SELECT to_regclass('public.fin_invoices')::text AS t")).rows[0].t, null);
    await migrate(scratch);
    assert.equal((await scratch.query<{ t: string | null }>("SELECT to_regclass('public.fin_invoices')::text AS t")).rows[0].t, "fin_invoices");
  } finally {
    await scratch.close();
  }
});
