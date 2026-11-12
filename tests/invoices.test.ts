import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PDFDocument } from "pdf-lib";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { one, rows, type DB } from "../src/infrastructure/database/db";
import { withDatabaseContext } from "../src/infrastructure/database/context";
import { financeAction, financeState } from "../src/features/finance/service";
import { financeDashboard } from "../src/features/finance/dashboard";
import { financeIntent, financeReply } from "../src/features/assistant/finance";
import {
  checkInvoice,
  dedupeKey,
  emptyDraft,
} from "../src/domain/invoices/checks";
import { setInvoiceAi } from "../src/features/invoices/extract";
import {
  factureXFromPdf,
  parseInvoiceXml,
} from "../src/features/invoices/structured";
import {
  documentFor,
  documentType,
  invoiceAction,
  invoiceActionSchema,
  invoicesState,
  uploadInvoice,
  type Run,
} from "../src/features/invoices/service";
import { loadDocument } from "../src/features/invoices/storage";

const R = "bernay";
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
let db: PGlite;
let dir: string;

const asApp =
  (userId: string, isPublic = false): Run =>
  (fn) =>
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
const web = asApp("nadia");

const cii = (
  number = "FA-2026-001",
  supplier = "Primeurs Martin",
  net = "100.00",
  vat = "5.50",
  gross = "105.50",
) => `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument><ram:ID>${number}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261102</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>${supplier}</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">FR12345678901</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty></ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261202</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>${net}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${vat}</ram:TaxTotalAmount><ram:GrandTotalAmount>${gross}</ram:GrandTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
const ubl = `<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ID>UBL-7</cbc:ID><cbc:IssueDate>2026-10-05</cbc:IssueDate><cbc:DueDate>2026-11-05</cbc:DueDate><cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Energie Plus</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty><cac:TaxTotal><cbc:TaxAmount currencyID="EUR">20.00</cbc:TaxAmount></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">120.00</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal></Invoice>`;
async function facturX(xml: string) {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await pdf.attach(Buffer.from(xml), "factur-x.xml", { mimeType: "text/xml" });
  return Buffer.from(await pdf.save());
}
const plainPdf = async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.setTitle(randomUUID());
  return Buffer.from(await pdf.save());
};
const jpeg = () =>
  Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.from(randomUUID())]);
const act = async (a: Parameters<typeof invoiceAction>[3], run: Run = web) => {
  const parsed = invoiceActionSchema.parse(a);
  return run((tx) => invoiceAction(tx, R, owner, parsed));
};
const entries = (id: string) =>
  rows<{ kind: string; journal: string }>(
    db,
    "SELECT n.kind,n.journal FROM fin_entries n JOIN fin_events e ON e.id=n.event_id WHERE e.source_id=$1 ORDER BY n.number",
    [id],
  );
const validation = (id: string, over: Record<string, unknown> = {}) => ({
  action: "validate" as const,
  id,
  supplierName: "Primeurs Martin",
  supplierVat: null,
  number: `F-${randomUUID().slice(0, 8)}`,
  invoiceDate: new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date()),
  dueDate: null,
  net: 10000,
  vat: 550,
  gross: 10550,
  category: "merchandise" as const,
  ...over,
});
const dashboard = () =>
  web((tx) => financeDashboard(tx, R, owner, { period: "month" }));

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "demo-invoices-"));
  process.env.ATACUISINE_DATA_DIR = dir;
  process.env.ATACUISINE_DEMO = "true";
  delete process.env.ANTHROPIC_API_KEY;
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(async () => {
  setInvoiceAi(undefined);
  delete process.env.ATACUISINE_DATA_DIR;
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

test("lecture : CII, UBL et Factur-X intégré à un vrai PDF", async () => {
  const fromCii = parseInvoiceXml(cii())!;
  assert.equal(fromCii.supplierName, "Primeurs Martin");
  assert.equal(fromCii.supplierVat, "FR12345678901");
  assert.equal(fromCii.number, "FA-2026-001");
  assert.equal(fromCii.invoiceDate, "2026-11-02");
  assert.equal(fromCii.dueDate, "2026-12-02");
  assert.deepEqual(
    [fromCii.net, fromCii.vat, fromCii.gross],
    [10000, 550, 10550],
  );
  const fromUbl = parseInvoiceXml(ubl)!;
  assert.equal(fromUbl.supplierName, "Energie Plus");
  assert.deepEqual(
    [fromUbl.net, fromUbl.vat, fromUbl.gross],
    [10000, 2000, 12000],
  );
  const embedded = await factureXFromPdf(await facturX(cii()));
  assert.equal(embedded?.number, "FA-2026-001");
  assert.equal(await factureXFromPdf(await plainPdf()), null);
  assert.equal(await factureXFromPdf(Buffer.from("%PDF-pas un pdf")), null);
});

test("lecture : XML hostile ou étranger ignoré", () => {
  assert.equal(
    parseInvoiceXml(
      `<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Invoice><ID>&e;</ID></Invoice>`,
    ),
    null,
  );
  assert.equal(parseInvoiceXml("<autre><ID>1</ID></autre>"), null);
  assert.equal(parseInvoiceXml("pas du xml <<<"), null);
});

test("contrôles : totaux, champs requis, avoirs, doublons insensibles à l’écriture", () => {
  const ok = {
    ...emptyDraft(),
    supplierName: "A",
    number: "1",
    invoiceDate: "2026-01-02",
    dueDate: "2026-02-02",
    net: 100,
    vat: 10,
    gross: 110,
    category: "other" as const,
  };
  assert.deepEqual(checkInvoice(ok), []);
  assert.match(
    checkInvoice({ ...ok, gross: 111 })[0].message,
    /total ne correspond pas/,
  );
  assert.ok(
    checkInvoice({ ...ok, gross: -1, net: -11 }).some((i) =>
      /avoirs/.test(i.message),
    ),
  );
  assert.ok(checkInvoice(emptyDraft()).every((i) => i.level === "blocking"));
  assert.equal(
    checkInvoice({ ...ok, dueDate: "2025-01-01" })[0].level,
    "warning",
  );
  assert.equal(
    checkInvoice(
      { ...ok, invoiceDate: "2099-01-01", dueDate: null },
      "2026-01-01",
    )[0].level,
    "warning",
  );
  assert.equal(
    dedupeKey("Primeurs Martin", "FA 001"),
    dedupeKey("primeurs-MARTIN", "fa-001"),
  );
});

test("format : reconnu au contenu réel, pas au nom", () => {
  assert.equal(documentType(Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(documentType(jpeg()), "image/jpeg");
  assert.equal(
    documentType(Buffer.from("<?xml version='1.0'?><a/>")),
    "application/xml",
  );
  assert.throws(
    () => documentType(Buffer.from("MZ exécutable")),
    /Format accepté/,
  );
});

test("sans clé IA : le dépôt fonctionne, rien n’est inventé, le fichier est archivé", async () => {
  const data = jpeg();
  const r = await uploadInvoice(web, R, owner, data, "../../photo facture.jpg");
  assert.equal(r.source, "manual");
  const row = await one<{
    supplier_name: string | null;
    gross: number | null;
    status: string;
    filename: string;
    object_key: string;
  }>(
    db,
    "SELECT i.supplier_name,i.gross,i.status,d.filename,d.object_key FROM fin_supplier_invoices i JOIN fin_documents d ON d.id=i.document_id WHERE i.id=$1",
    [r.id],
  );
  assert.equal(row.supplier_name, null);
  assert.equal(row.gross, null);
  assert.equal(row.status, "to_review");
  assert.ok(!row.filename.includes("/"));
  assert.deepEqual(Buffer.from((await loadDocument(row.object_key))!), data);
  assert.equal((await entries(r.id)).length, 0);
  const again = await uploadInvoice(web, R, owner, data, "autre-nom.jpg");
  assert.equal(again.duplicate, true);
  assert.equal(again.id, r.id);
  await assert.rejects(
    uploadInvoice(web, R, owner, Buffer.from("<x/>"), "x.xml"),
    /CII ou UBL/,
  );
  await assert.rejects(
    uploadInvoice(web, R, owner, Buffer.alloc(0), "vide"),
    /vide/,
  );
});

test("Factur-X : champs lus sans IA, puis validation humaine obligatoire", async () => {
  const r = await uploadInvoice(
    web,
    R,
    owner,
    await facturX(cii("FX-1")),
    "fx.pdf",
  );
  assert.equal(r.source, "facturx");
  const state = await web((tx) => invoicesState(tx, R, owner));
  const item = state.invoices.find((i) => i.id === r.id)!;
  assert.equal(item.gross, 10550);
  assert.equal(item.status, "to_review");
  assert.equal((await entries(r.id)).length, 0);
  await assert.rejects(act(validation(r.id)), /régime de TVA/);
});

test("validation : écriture d’achat équilibrée, fournisseur créé, puis règlement", async () => {
  const view = await db.transaction((tx) => financeState(tx, R, owner));
  const s = view.settings;
  await db.transaction((tx) =>
    financeAction(tx, R, owner, {
      action: "settings",
      vatRegime: "normal",
      cashAccount: s.cash_account,
      cardAccount: s.card_account,
      otherAccount: s.other_account,
      salesAccount: s.sales_account,
    }),
  );
  const r = await uploadInvoice(
    web,
    R,
    owner,
    await facturX(cii("FX-2")),
    "fx2.pdf",
  );
  await assert.rejects(
    act(validation(r.id, { gross: 10551 })),
    /total ne correspond pas/,
  );
  await act(validation(r.id, { number: "FX-2" }));
  assert.deepEqual(await entries(r.id), [{ kind: "purchase", journal: "AC" }]);
  const lines = await rows<{
    account_code: string;
    debit: number;
    credit: number;
  }>(
    db,
    "SELECT l.account_code,l.debit,l.credit FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id JOIN fin_events e ON e.id=n.event_id WHERE e.source_id=$1 ORDER BY line_no",
    [r.id],
  );
  assert.deepEqual(
    lines.map((l) => [l.account_code, Number(l.debit), Number(l.credit)]),
    [
      ["607", 10000, 0],
      ["44566", 550, 0],
      ["401", 0, 10550],
    ],
  );
  const supplier = await rows(
    db,
    "SELECT id FROM suppliers WHERE restaurant_id=$1 AND name='Primeurs Martin'",
    [R],
  );
  assert.equal(supplier.length, 1);
  await assert.rejects(act(validation(r.id)), /déjà été traitée/);
  await act({ action: "pay", id: r.id, paidOn: "2026-11-05", method: "bank" });
  assert.deepEqual(
    (await entries(r.id)).map((e) => e.kind),
    ["purchase", "purchase_payment"],
  );
  await assert.rejects(
    act({ action: "pay", id: r.id, paidOn: "2026-11-05", method: "bank" }),
    /validée/,
  );
});

test("doublon : même fournisseur et même numéro refusés, même écrits autrement", async () => {
  const r = await uploadInvoice(
    web,
    R,
    owner,
    await facturX(cii("fx 2", "PRIMEURS-MARTIN")),
    "copie.pdf",
  );
  const state = await web((tx) => invoicesState(tx, R, owner));
  assert.ok(
    state.invoices
      .find((i) => i.id === r.id)!
      .issues.some((i) => /déjà ce numéro/.test(i.message)),
  );
  await assert.rejects(
    act(validation(r.id, { supplierName: "PRIMEURS-MARTIN", number: "fx 2" })),
    /déjà ce numéro/,
  );
  await assert.rejects(
    db.query(
      "UPDATE fin_supplier_invoices SET supplier_name='A',invoice_number='B',invoice_date='2026-01-01',net=1,vat=0,gross=1,category='other',status='validated',dedupe_key=(SELECT dedupe_key FROM fin_supplier_invoices WHERE status='paid' LIMIT 1) WHERE id=$1",
      [r.id],
    ),
  );
});

test("annulation : contre-passation complète, justificatif conservé, reprise possible", async () => {
  const r = await uploadInvoice(
    web,
    R,
    owner,
    await facturX(cii("FX-3")),
    "fx3.pdf",
  );
  await act(validation(r.id, { number: "FX-3" }));
  await act({ action: "pay", id: r.id, paidOn: "2026-11-06", method: "cash" });
  await act({
    action: "cancel",
    id: r.id,
    reason: "Facture adressée par erreur",
  });
  assert.deepEqual(
    (await entries(r.id)).map((e) => e.kind),
    ["purchase", "purchase_payment", "reversal", "reversal"],
  );
  const balance = await one<{ total: number }>(
    db,
    "SELECT coalesce(sum(l.debit-l.credit) FILTER (WHERE l.account_code='401'),0)::int AS total FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id JOIN fin_events e ON e.id=n.event_id WHERE e.source_id=$1",
    [r.id],
  );
  assert.equal(balance.total, 0);
  await act({ action: "reopen", id: r.id });
  await act(validation(r.id, { number: "FX-3" }));
  const kinds = (await entries(r.id)).map((e) => e.kind);
  assert.equal(kinds.at(-1), "purchase");
  const chain = await one<{ broken_at: number | null }>(
    db,
    "SELECT broken_at FROM app.fin_verify_chain($1)",
    [R],
  );
  assert.equal(chain.broken_at, null);
  await assert.rejects(db.query("DELETE FROM fin_documents"), /ajout seul/);
  await assert.rejects(
    db.query("UPDATE fin_documents SET filename='x'"),
    /ajout seul/,
  );
});

test("IA : champs proposés sans écriture, crédits débités, chiffres douteux signalés", async () => {
  let request: Record<string, unknown> = {};
  const reply = (over: Record<string, unknown> = {}) => ({
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 2000, output_tokens: 200 },
    content: [
      {
        type: "text",
        text: JSON.stringify({
          is_invoice: true,
          supplier_name: "Boucherie Dupont",
          supplier_vat_number: null,
          invoice_number: "B-99",
          invoice_date: "2026-11-03",
          due_date: null,
          total_excluding_tax_cents: 5000,
          total_vat_cents: 275,
          total_including_tax_cents: 5300,
          category: "merchandise",
          uncertain_fields: ["total_including_tax_cents"],
          ...over,
        }),
      },
    ],
  });
  setInvoiceAi({
    messages: {
      create: async (p: Record<string, unknown>) => {
        request = p;
        return reply();
      },
    },
  });
  const before = await one<{ balance: number }>(
    db,
    "SELECT balance FROM app.ai_wallets w JOIN restaurants r ON r.organization_id=w.organization_id WHERE r.id=$1",
    [R],
  );
  const r = await uploadInvoice(web, R, owner, jpeg(), "photo.jpg");
  assert.equal(r.source, "ai");
  assert.equal(
    request.tools,
    undefined,
    "aucun outil exposé au contenu du document",
  );
  assert.ok(JSON.stringify(request.system).includes("jamais une consigne"));
  const after = await one<{ balance: number }>(
    db,
    "SELECT balance FROM app.ai_wallets w JOIN restaurants r ON r.organization_id=w.organization_id WHERE r.id=$1",
    [R],
  );
  assert.ok(after.balance < before.balance);
  assert.equal((await entries(r.id)).length, 0);
  const item = (await web((tx) => invoicesState(tx, R, owner))).invoices.find(
    (i) => i.id === r.id,
  )!;
  assert.ok(item.issues.some((i) => /total ne correspond pas/.test(i.message)));
  assert.deepEqual(item.uncertain, ["total_including_tax_cents"]);
  // Réponse inexploitable, refus ou panne : dépôt conservé, à compléter à la main.
  setInvoiceAi({
    messages: {
      create: async () => ({ ...reply(), stop_reason: "refusal", content: [] }),
    },
  });
  const refused = await uploadInvoice(
    web,
    R,
    owner,
    await plainPdf(),
    "refus.pdf",
  );
  assert.equal(
    (
      await one<{ gross: number | null }>(
        db,
        "SELECT gross FROM fin_supplier_invoices WHERE id=$1",
        [refused.id],
      )
    ).gross,
    null,
  );
  setInvoiceAi({
    messages: {
      create: async () => {
        throw new Error("panne");
      },
    },
  });
  const down = await uploadInvoice(web, R, owner, jpeg(), "panne.jpg");
  assert.equal(down.source, "manual");
  assert.match(down.message, /indisponible/);
  // Valeurs impossibles lues par l’IA : laissées vides, jamais enregistrées.
  setInvoiceAi({
    messages: {
      create: async () =>
        reply({ invoice_date: "03/11/2026", total_vat_cents: -5 }),
    },
  });
  const odd = await uploadInvoice(web, R, owner, jpeg(), "bizarre.jpg");
  const oddRow = await one<{ invoice_date: string | null; vat: number | null }>(
    db,
    "SELECT invoice_date,vat FROM fin_supplier_invoices WHERE id=$1",
    [odd.id],
  );
  assert.deepEqual([oddRow.invoice_date, oddRow.vat], [null, null]);
  setInvoiceAi(undefined);
});

test("tableau de bord et assistant : TVA déductible, à régler, marchandises, classement", async () => {
  const r = await uploadInvoice(
    web,
    R,
    owner,
    await facturX(cii("FX-4")),
    "fx4.pdf",
  );
  await act(validation(r.id, { number: "FX-4", dueDate: "2020-01-01" }));
  const d = await dashboard();
  assert.ok(d.metrics.vatDeductible.value! >= 550);
  assert.ok(d.metrics.supplierCost.value! >= 10000);
  assert.ok(d.metrics.merchandiseCost.value! >= 10000);
  assert.ok(d.metrics.unpaidInvoices.value! >= 10550);
  assert.match(d.metrics.unpaidInvoices.note, /en retard/);
  assert.equal(d.metrics.unpaidInvoices.status, "partial");
  assert.match(d.metrics.supplierCost.note, /à valider/);
  assert.ok(d.invoicesToReview > 0);
  assert.equal(d.topSuppliers[0].name, "Primeurs Martin");
  assert.equal(
    financeIntent("Combien avons-nous dépensé en marchandises ?"),
    "merchandise",
  );
  assert.match(financeReply("suppliers", d), /Primeurs Martin/);
  assert.match(financeReply("invoices", d), /à régler/);
  assert.doesNotMatch(financeReply("merchandise", d), /je ne peux pas/);
});

test("droits : salle, public et autre établissement sans accès, sous le rôle applicatif", async () => {
  const salle = asApp("sarah");
  const visitor = asApp("", true);
  await assert.rejects(
    uploadInvoice(salle, R, waiter, jpeg(), "x.jpg"),
    /refusé/,
  );
  await assert.rejects(
    salle((tx) => invoicesState(tx, R, waiter)),
    /refusé/,
  );
  const anyInvoice = await one<{ id: string }>(
    db,
    "SELECT id FROM fin_supplier_invoices LIMIT 1",
  );
  await assert.rejects(
    salle((tx) => documentFor(tx, R, waiter, anyInvoice.id)),
    /refusé/,
  );
  for (const table of ["fin_documents", "fin_supplier_invoices"]) {
    assert.equal(
      (await salle((tx: DB) => rows(tx, `SELECT * FROM ${table}`))).length,
      0,
      table,
    );
    assert.equal(
      (await visitor((tx: DB) => rows(tx, `SELECT * FROM ${table}`))).length,
      0,
      table,
    );
  }
  await assert.rejects(
    salle((tx: DB) =>
      tx.query("SELECT app.fin_reverse_invoice($1,'x','motif assez long')", [
        R,
      ]),
    ),
    /refusé/,
  );
  await assert.rejects(
    salle((tx: DB) =>
      tx.query(
        "SELECT app.fin_post_invoice($1,'k','invoice.paid','x',1,'purchase_payment','x',now()::date,'[]','BQ')",
        [R],
      ),
    ),
    /refusé/,
  );
  assert.equal(
    (
      await salle((tx: DB) =>
        tx.query("UPDATE fin_supplier_invoices SET gross=1"),
      )
    ).affectedRows,
    0,
  );
  // Un document d’un autre établissement reste introuvable.
  await db.query(
    "INSERT INTO profiles(id,name,role,email) VALUES('inv-other','Autre','OWNER','a@example.test') ON CONFLICT DO NOTHING",
  );
  await db.query("SELECT set_config('app.user_id','inv-other',false)");
  await db.query(
    "SELECT app.bootstrap_organization('inv-org','Autre','inv-r','Autre')",
  );
  await db.query("SELECT set_config('app.user_id','',false)");
  await db.query(
    "UPDATE app.organization_plans SET plan=39 WHERE organization_id='inv-org'",
  );
  const other = { id: "inv-other", name: "Autre", role: "OWNER" as const };
  const otherRun = (fn: (tx: DB) => Promise<unknown>) =>
    withDatabaseContext({ userId: "inv-other", restaurantId: "inv-r" }, () =>
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        await tx.query(
          "SELECT set_config('app.user_id','inv-other',true),set_config('app.restaurant_id','inv-r',true),set_config('app.public','false',true)",
        );
        return fn(tx);
      }),
    );
  await assert.rejects(
    otherRun((tx) => documentFor(tx, "inv-r", other, anyInvoice.id)),
    /introuvable|add-on Factures fournisseurs/,
  );
});

test("migration : descente refusée avec des justificatifs, puis cycle complet à vide", async () => {
  await assert.rejects(
    db.exec(
      await readFile(
        "database/migrations/down/038_supplier_invoices.sql",
        "utf8",
      ),
    ),
    /Retour arrière refusé/,
  );
  const scratch = new PGlite();
  try {
    await scratch.exec(
      await readFile("database/migrations/001_core.sql", "utf8"),
    );
    await migrate(scratch);
    await scratch.exec(
      await readFile("database/migrations/down/041_sales_invoices.sql", "utf8"),
    );
    await scratch.exec(
      await readFile("database/migrations/down/040_hr_payroll.sql", "utf8"),
    );
    await scratch.exec(
      await readFile("database/migrations/down/039_bank_reconciliation.sql", "utf8"),
    );
    await scratch.exec(
      await readFile(
        "database/migrations/down/038_supplier_invoices.sql",
        "utf8",
      ),
    );
    const gone = await scratch.query<{ t: string | null }>(
      "SELECT to_regclass('public.fin_documents')::text AS t",
    );
    assert.equal(gone.rows[0].t, null);
    await migrate(scratch);
    const back = await scratch.query<{ t: string | null }>(
      "SELECT to_regclass('public.fin_documents')::text AS t",
    );
    assert.equal(back.rows[0].t, "fin_documents");
  } finally {
    await scratch.close();
  }
});
