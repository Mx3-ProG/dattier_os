import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { one, rows, type DB } from "../src/infrastructure/database/db";
import { withDatabaseContext } from "../src/infrastructure/database/context";
import { financeAction, financeState } from "../src/features/finance/service";
import { financeDashboard } from "../src/features/finance/dashboard";
import { financeIntent, financeReply } from "../src/features/assistant/finance";
import { invoiceAction, uploadInvoice } from "../src/features/invoices/service";
import {
  parseAmount,
  parseDate,
  parseStatement,
  withKeys,
} from "../src/features/bank/parsers";
import {
  candidatesFor,
  possibleDuplicates,
  type Pools,
} from "../src/domain/bank/matching";
import {
  bankAction,
  bankActionSchema,
  bankState,
  bankTreasury,
  importStatement,
  type Run,
} from "../src/features/bank/service";

const R = "bernay";
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
let db: PGlite;
let dir: string;
let account = "";

const asApp = (userId: string, isPublic = false): Run => (fn) =>
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
const act = (a: Parameters<typeof bankAction>[3]) => {
  const parsed = bankActionSchema.parse(a);
  return web((tx) => bankAction(tx, R, owner, parsed));
};
const state = () => web((tx) => bankState(tx, R, owner));
const csv = (lines: string[]) =>
  Buffer.from(["Date;Libellé;Montant", ...lines].join("\n"));
const empty: Pools = { invoices: [], payouts: [], cardDays: [] };
const importCsv = (lines: string[], name = "releve.csv") =>
  importStatement(web, R, owner, account, csv(lines), name);
const entriesOf = (key: string) =>
  rows<{ kind: string; account_code: string; debit: number; credit: number }>(
    db,
    "SELECT n.kind,l.account_code,l.debit,l.credit FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id JOIN fin_events e ON e.id=n.event_id WHERE e.dedupe_key=$1 ORDER BY n.number,l.line_no",
    [key],
  );
const invoice = async (number: string, gross: number, day: string, supplier = "Primeurs Martin") => {
  const xml = `<?xml version="1.0"?><Invoice xmlns:cbc="u" xmlns:cac="v"><cbc:ID>${number}</cbc:ID><cbc:IssueDate>${day}</cbc:IssueDate><cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>${supplier}</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty></Invoice>`;
  const up = await uploadInvoice(web, R, owner, Buffer.from(xml), `${number}.xml`);
  await web((tx) =>
    invoiceAction(tx, R, owner, {
      action: "validate", id: up.id, supplierName: supplier, supplierVat: null, number,
      invoiceDate: day, dueDate: null, net: gross - 100, vat: 100, gross, category: "merchandise",
    }),
  );
  return up.id;
};

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "demo-bank-"));
  process.env.ATACUISINE_DATA_DIR = dir;
  process.env.ATACUISINE_DEMO = "true";
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  const view = await db.transaction((tx) => financeState(tx, R, owner));
  const s = view.settings;
  await db.transaction((tx) =>
    financeAction(tx, R, owner, { action: "settings", vatRegime: "normal", cashAccount: s.cash_account, cardAccount: s.card_account, otherAccount: s.other_account, salesAccount: s.sales_account }),
  );
});
after(async () => {
  delete process.env.ATACUISINE_DATA_DIR;
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

test("montants et dates : formats français, le reste est refusé", () => {
  assert.equal(parseAmount("1 234,56"), 123456);
  assert.equal(parseAmount("1 234,56 €"), 123456);
  assert.equal(parseAmount("-12.5"), -1250);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount("+45"), 4500);
  assert.equal(parseAmount("0,07"), 7);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseDate("31/12/2026"), "2026-12-31");
  assert.equal(parseDate("05-11-26"), "2026-11-05");
  assert.equal(parseDate("2026-11-05T10:00:00"), "2026-11-05");
  assert.equal(parseDate("20261105120000[+1]"), "2026-11-05");
  assert.equal(parseDate("13/25/2026"), null, "le format américain n’est pas supposé");
  assert.equal(parseDate("31/02/2026"), null);
});

test("CSV : préambule, débit et crédit séparés, encodage Windows, ligne illisible refusée", () => {
  const withColumns = parseStatement(
    Buffer.from("Compte courant\nExporté le 01/11/2026\n\nDate opération;Libellé;Débit;Crédit\n02/11/2026;PRLV EDF;\"120,50\";\n03/11/2026;REMISE CB;;\"1 000,00\"\nTotal;;120,50;1000,00\n"),
  );
  assert.deepEqual(withColumns.movements.map((m) => m.amount), [-12050, 100000]);
  assert.equal(withColumns.format, "csv");
  const latin = parseStatement(Buffer.from("Date;Libellé;Montant\n02/11/2026;Dépôt espèces;50,00", "latin1"));
  assert.equal(latin.movements[0].label, "Dépôt espèces");
  const comma = parseStatement(Buffer.from('date,description,amount\n2026-11-02,"Loyer, novembre",-800.00'));
  assert.equal(comma.movements[0].label, "Loyer, novembre");
  assert.equal(comma.movements[0].amount, -80000);
  assert.throws(() => parseStatement(Buffer.from("a;b\n1;2")), /Colonnes non reconnues/);
  assert.throws(() => parseStatement(Buffer.from("Date;Montant\n02/11/2026;douze")), /montant illisible/);
  assert.throws(() => parseStatement(Buffer.from("Date;Montant\n13/13/2026;12")), /date illisible/);
  assert.throws(() => parseStatement(Buffer.from("Date;Montant\n")), /Aucun mouvement/);
});

test("OFX : balises sans fermeture, identifiants, solde et devise", () => {
  const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR<BANKACCTFROM><ACCTID>FR7612345678901234
</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261102<TRNAMT>-120.50<FITID>A1<NAME>PRLV EDF<MEMO>Novembre
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261103120000<TRNAMT>1000,00<FITID>A2<NAME>REMISE CB
</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>5879.50<DTASOF>20261103</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const s = parseStatement(Buffer.from(ofx));
  assert.equal(s.format, "ofx");
  assert.deepEqual(s.movements.map((m) => [m.bookedOn, m.amount, m.externalId]), [["2026-11-02", -12050, "A1"], ["2026-11-03", 100000, "A2"]]);
  assert.equal(s.movements[0].label, "PRLV EDF Novembre");
  assert.equal(s.balance, 587950);
  assert.equal(s.balanceDate, "2026-11-03");
  assert.equal(s.ibanEnd, "1234");
  assert.throws(() => parseStatement(Buffer.from(ofx.replace("EUR", "USD"))), /euros/);
});

test("CAMT.053 : sens, solde de clôture, écritures en attente écartées, XML hostile refusé", () => {
  const entry = (amount: string, side: string, ref: string, status = "BOOK", info = "Virement") =>
    `<Ntry><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>${side}</CdtDbtInd><Sts><Cd>${status}</Cd></Sts><BookgDt><Dt>2026-11-05</Dt></BookgDt><AcctSvcrRef>${ref}</AcctSvcrRef><AddtlNtryInf>${info}</AddtlNtryInf><NtryDtls><TxDtls><RmtInf><Ustrd>Facture 12</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`;
  const xml = (entries: string) => `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt><Acct><Id><IBAN>FR76 3000 6000 0112 3456 7890 189</IBAN></Id></Acct><Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-11-01</Dt></Dt></Bal><Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Dt><Dt>2026-11-30</Dt></Dt></Bal>${entries}</Stmt></BkToCstmrStmt></Document>`;
  const s = parseStatement(Buffer.from(xml(entry("150.00", "DBIT", "R1") + entry("20.00", "CRDT", "R2") + entry("9.00", "CRDT", "R3", "PDNG"))));
  assert.equal(s.format, "camt053");
  assert.deepEqual(s.movements.map((m) => [m.amount, m.externalId]), [[-15000, "R1"], [2000, "R2"]]);
  assert.equal(s.movements[0].label, "Virement Facture 12");
  assert.equal(s.balance, -5000);
  assert.equal(s.balanceDate, "2026-11-30");
  assert.equal(s.ibanEnd, "0189");
  assert.throws(() => parseStatement(Buffer.from(xml(entry("1.00", "CRDT", "R").replace('Ccy="EUR"', 'Ccy="USD"')))), /euros/);
  assert.throws(() => parseStatement(Buffer.from(`<!DOCTYPE x [<!ENTITY e "y">]>${xml(entry("1.00", "CRDT", "R"))}`)), /entités/);
});

test("clés de doublon : stables à la réimportation, deux opérations identiques distinguées", () => {
  const m = { bookedOn: "2026-11-02", amount: -500, label: "Café", externalId: null };
  const [a, b] = withKeys([m, m]);
  assert.notEqual(a.key, b.key);
  assert.equal(withKeys([{ ...m, label: "CAFÉ" }])[0].key, a.key);
  assert.equal(withKeys([{ ...m, externalId: "X" }])[0].key, withKeys([{ ...m, amount: 1, externalId: "X" }])[0].key);
});

test("correspondances : montant exact, fournisseur nommé, jamais d’invention", () => {
  const tx = (amount: number, label: string, bookedOn = "2026-11-10") => ({ id: "t", amount, label, bookedOn });
  assert.deepEqual(candidatesFor(tx(12500, "VIR RECU CLIENT"), empty), [], "+125 € sans opération : rien");
  const pools: Pools = {
    invoices: [
      { id: "a", supplier: "Primeurs Martin", number: "1", gross: 5000, invoiceDate: "2026-11-01" },
      { id: "b", supplier: "Boucherie Dupont", number: "2", gross: 5000, invoiceDate: "2026-11-02" },
      { id: "old", supplier: "Vieux", number: "3", gross: 7000, invoiceDate: "2025-01-01" },
    ],
    payouts: [{ id: "p", amount: 9000, sentOn: "2026-11-08" }],
    cardDays: [
      { day: "2026-11-09", total: 1000 },
      { day: "2026-11-08", total: 500 },
    ],
  };
  const named = candidatesFor(tx(-5000, "PRLV PRIMEURS MARTIN"), pools);
  assert.deepEqual(named.map((c) => c.confidence).sort(), ["high", "medium"]);
  assert.equal(named.find((c) => c.confidence === "high")?.targets[0], "invoice:a");
  assert.ok(candidatesFor(tx(-5000, "PRLV INCONNU"), pools).every((c) => c.confidence === "medium"));
  assert.deepEqual(candidatesFor(tx(-7000, "x"), pools), [], "facture trop ancienne");
  assert.equal(candidatesFor(tx(9000, "VIR STRIPE PAYOUT"), pools)[0].confidence, "high");
  assert.deepEqual(candidatesFor(tx(9000, "x", "2026-12-20"), pools), []);
  // Versement groupé : distinct d’une vente, et reconnu avec sa commission.
  const cards = candidatesFor(tx(1450, "REMISE CB 123"), pools).find((c) => c.targets.length === 2)!;
  assert.deepEqual(cards.targets.sort(), ["card:2026-11-08", "card:2026-11-09"]);
  assert.equal(cards.difference, 50);
  assert.ok(!candidatesFor(tx(1450, "VIR PARTICULIER"), pools).some((c) => c.kind === "card_batch"), "commission sans libellé de carte");
  assert.ok(!candidatesFor(tx(1000, "REMISE CB", "2026-11-09"), pools).some((c) => c.targets.includes("card:2026-11-09")), "jamais le jour même");
  assert.equal(candidatesFor(tx(30000, "VERSEMENT ESPECES"), pools)[0].kind, "cash_deposit");
  const dupes = possibleDuplicates([
    { id: "1", amount: -5, label: "Abo", bookedOn: "2026-11-01" },
    { id: "2", amount: -5, label: "ABO", bookedOn: "2026-11-03" },
    { id: "3", amount: -5, label: "Abo", bookedOn: "2026-12-01" },
  ]);
  assert.deepEqual([...dupes].sort(), ["1", "2"]);
});

test("import : fichier rejoué et relevé qui chevauche n’ajoutent aucun doublon", async () => {
  await assert.rejects(importCsv(["02/11/2026;X;1"]), /introuvable/);
  const created = (await act({ action: "account", label: "Compte courant", openingBalance: 100000, openingDate: "2026-10-31" })) as { id: string };
  account = created.id;
  const first = await importCsv(["02/11/2026;PRLV EDF;-100,00", "03/11/2026;VIR DIVERS;250,00"]);
  assert.deepEqual([first.added, first.skipped, first.duplicateFile], [2, 0, false]);
  const replay = await importCsv(["02/11/2026;PRLV EDF;-100,00", "03/11/2026;VIR DIVERS;250,00"]);
  assert.equal(replay.duplicateFile, true);
  const overlap = await importCsv(["03/11/2026;VIR DIVERS;250,00", "04/11/2026;CAFE;-5,00"]);
  assert.deepEqual([overlap.added, overlap.skipped], [1, 1]);
  const s = await state();
  assert.equal(s.toReview, 3);
  assert.equal(s.accounts[0].balance, 100000 - 10000 + 25000 - 500);
  assert.equal(s.accounts[0].asOf, "2026-11-04");
});

test("solde : l’écart avec le relevé est signalé, et le relevé fait foi ensuite", async () => {
  const ofx = (amount: string, id: string, balance: string, day: string) =>
    Buffer.from(`OFXHEADER:100\n<OFX><STMTTRN><DTPOSTED>${day}<TRNAMT>${amount}<FITID>${id}<NAME>Op ${id}</STMTTRN><LEDGERBAL><BALAMT>${balance}<DTASOF>${day}</LEDGERBAL></OFX>`);
  const wrong = await importStatement(web, R, owner, account, ofx("10.00", "B1", "9999.00", "20261105"), "a.ofx");
  assert.match(wrong.balanceWarning ?? "", /diffère/);
  assert.equal((await web((tx) => bankTreasury(tx, R)))[0].balance, 999900);
  const right = await importStatement(web, R, owner, account, ofx("100.00", "B2", "10099.00", "20261106"), "b.ofx");
  assert.ok(right.balanceWarning !== null || right.added === 1);
  assert.equal((await web((tx) => bankTreasury(tx, R)))[0].balance, 1009900);
});

test("facture : rapprochée, réglée à la date du mouvement, écriture unique, annulable", async () => {
  const id = await invoice("BK-1", 8000, "2026-11-01");
  await importCsv(["05/11/2026;PRLV PRIMEURS MARTIN;-80,00"], "fact.csv");
  const t = (await state()).open.find((x) => x.label.includes("PRIMEURS"))!;
  const c = t.candidates.find((x) => x.kind === "invoice")!;
  assert.equal(c.confidence, "high");
  // Le navigateur ne peut pas désigner autre chose que ce que le serveur a calculé.
  await assert.rejects(act({ action: "match", id: t.id, kind: "invoice", targets: ["invoice:autre"] }), /plus disponible/);
  await act({ action: "match", id: t.id, kind: "invoice", targets: c.targets });
  const row = await one<{ status: string; paid_on: string; paid_method: string }>(db, "SELECT status,paid_on::text,paid_method FROM fin_supplier_invoices WHERE id=$1", [id]);
  assert.deepEqual([row.status, row.paid_on, row.paid_method], ["paid", "2026-11-05", "bank"]);
  assert.deepEqual((await entriesOf(`invoice-paid:${id}`)).map((e) => e.account_code), ["401", "512"]);
  await assert.rejects(act({ action: "match", id: t.id, kind: "invoice", targets: c.targets }), /déjà été traité/);
  await assert.rejects(
    web((tx) => invoiceAction(tx, R, owner, { action: "cancel", id, reason: "Tentative d’annulation" })),
    /annulez d’abord le rapprochement/,
  );
  await act({ action: "undo", id: t.id, reason: "Mauvaise facture choisie" });
  assert.equal((await one<{ status: string }>(db, "SELECT status FROM fin_supplier_invoices WHERE id=$1", [id])).status, "validated");
  assert.equal((await entriesOf(`invoice-paid:${id}`)).filter((e) => e.kind === "reversal").length, 2);
  const again = (await state()).open.find((x) => x.id === t.id)!;
  await act({ action: "match", id: t.id, kind: "invoice", targets: again.candidates[0].targets });
  assert.equal((await one<{ status: string }>(db, "SELECT status FROM fin_supplier_invoices WHERE id=$1", [id])).status, "paid");
});

test("facture déjà marquée réglée : le mouvement la relie, sans seconde écriture", async () => {
  const id = await invoice("BK-2", 3300, "2026-11-01", "Fromagerie Lait");
  await web((tx) => invoiceAction(tx, R, owner, { action: "pay", id, paidOn: "2026-11-02", method: "bank" }));
  await importCsv(["06/11/2026;VIR FROMAGERIE;-33,00"], "lien.csv");
  const t = (await state()).open.find((x) => x.label.includes("FROMAGERIE"))!;
  assert.equal(t.candidates[0].kind, "invoice_link");
  const before = (await entriesOf(`invoice-paid:${id}`)).length;
  await act({ action: "match", id: t.id, kind: "invoice_link", targets: t.candidates[0].targets });
  assert.equal((await entriesOf(`invoice-paid:${id}`)).length, before);
  await act({ action: "undo", id: t.id, reason: "Rattachement erroné" });
  assert.equal((await one<{ status: string }>(db, "SELECT status FROM fin_supplier_invoices WHERE id=$1", [id])).status, "paid");
});

test("remise de cartes : commission isolée, journée non rapprochable deux fois", async () => {
  await db.query("INSERT INTO orders(id,restaurant_id,channel,status,idempotency_key) VALUES('bk-o','bernay','takeaway','paid','bk-o')");
  await db.query("INSERT INTO payment_declarations(id,order_id,amount,method,actor,created_at) VALUES('bk-p','bk-o',10000,'card','nadia',now()-interval '1 day')");
  const paris = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(ms));
  const day = paris(Date.now() - 86400_000);
  const today = paris(Date.now());
  const sameDay = (await db.query<{ total: number }>("SELECT sum(p.amount)::int AS total FROM payment_declarations p JOIN orders o ON o.id=p.order_id WHERE o.restaurant_id='bernay' AND p.method='card' AND (p.created_at AT TIME ZONE 'Europe/Paris')::date=$1::date", [day])).rows[0].total;
  const received = sameDay - 150;
  await importCsv([`${today.split("-").reverse().join("/")};REMISE CB 001;${(received / 100).toFixed(2).replace(".", ",")}`], "cb.csv");
  const t = (await state()).open.find((x) => x.label.includes("REMISE CB"))!;
  const c = t.candidates.find((x) => x.kind === "card_batch" && x.targets.length === 1 && x.difference === 150)!;
  assert.ok(c, "remise proposée avec sa commission");
  await act({ action: "match", id: t.id, kind: "card_batch", targets: c.targets });
  const match = await one<{ id: string }>(db, "SELECT id FROM fin_bank_matches WHERE transaction_id=$1 AND undone_at IS NULL", [t.id]);
  const lines = await entriesOf(`bank-match:${match.id}`);
  assert.deepEqual(lines.map((l) => l.account_code), ["512", "627", "5115"]);
  assert.equal(Number(lines[1].debit), 150);
  assert.equal(Number(lines[2].credit), sameDay);
  await assert.rejects(
    db.query("INSERT INTO fin_bank_match_targets(restaurant_id,target_key,match_id) VALUES($1,$2,$3)", [R, c.targets[0], match.id]),
  );
  assert.ok(!(await state()).open.some((x) => x.candidates.some((k) => k.targets.includes(c.targets[0]))));
});

test("sans correspondance : écarté avec motif, ou laissé à vérifier ; repris à volonté", async () => {
  await importCsv(["07/11/2026;VIR MYSTERE;125,00"], "myst.csv");
  const t = (await state()).open.find((x) => x.label.includes("MYSTERE"))!;
  assert.deepEqual(t.candidates, []);
  const sales = await one<{ count: number }>(db, "SELECT count(*)::int AS count FROM payment_declarations");
  await act({ action: "ignore", id: t.id, note: "Apport du gérant" });
  assert.equal((await one<{ count: number }>(db, "SELECT count(*)::int AS count FROM payment_declarations")).count, sales.count);
  await assert.rejects(act({ action: "ignore", id: t.id, note: "Encore une fois" }), /déjà été traité/);
  await act({ action: "restore", id: t.id });
  assert.ok((await state()).open.some((x) => x.id === t.id));
});

test("automatique : désactivé par défaut, puis seulement les cas sans ambiguïté", async () => {
  const id = await invoice("BK-3", 4100, "2026-11-01", "Cave Lambert");
  const off = await importCsv(["08/11/2026;PRLV CAVE LAMBERT;-41,00"], "auto1.csv");
  assert.equal(off.matched, 0);
  await act({ action: "autoMatch", enabled: true });
  const ambiguous = await invoice("BK-4", 6200, "2026-11-01", "Vins Durand");
  await invoice("BK-5", 6200, "2026-11-02", "Vins Durand");
  const on = await importCsv(["09/11/2026;PRLV VINS DURAND;-62,00"], "auto2.csv");
  assert.ok(on.matched >= 1, "la facture Lambert en attente part");
  assert.equal((await one<{ status: string }>(db, "SELECT status FROM fin_supplier_invoices WHERE id=$1", [id])).status, "paid");
  assert.equal((await one<{ status: string }>(db, "SELECT status FROM fin_supplier_invoices WHERE id=$1", [ambiguous])).status, "validated", "deux factures possibles : la décision reste humaine");
  const auto = await one<{ automatic: boolean }>(db, "SELECT m.automatic FROM fin_bank_matches m JOIN fin_bank_match_targets t ON t.match_id=m.id WHERE t.target_key=$1", [`invoice:${id}`]);
  assert.equal(auto.automatic, true);
  await act({ action: "autoMatch", enabled: false });
});

test("tableau de bord et assistant : trésorerie réelle, distincte des encaissements", async () => {
  const d = await web((tx) => financeDashboard(tx, R, owner, { period: "month" }));
  const balance = (await web((tx) => bankTreasury(tx, R)))[0].balance;
  assert.equal(d.metrics.treasury.value, balance);
  assert.equal(d.metrics.treasury.status, "confirmed");
  assert.match(d.metrics.treasury.note, /Hors espèces/);
  assert.ok(d.bankToReview > 0);
  assert.equal(financeIntent("Quelle est notre trésorerie ?"), "treasury");
  assert.equal(financeIntent("Combien avons-nous en banque ?"), "treasury");
  assert.match(financeReply("treasury", d), /restent à rapprocher/);
  assert.ok((await db.transaction((tx) => financeState(tx, R, owner))).counts.bank > 0);
});

test("preuve : un mouvement importé ne se modifie ni ne se supprime", async () => {
  await assert.rejects(db.query("UPDATE fin_bank_transactions SET amount=1"), /ajout seul/);
  await assert.rejects(db.query("UPDATE fin_bank_transactions SET label='x'"), /ajout seul/);
  await assert.rejects(db.query("DELETE FROM fin_bank_transactions"), /ajout seul/);
  await assert.rejects(db.query("UPDATE fin_bank_imports SET added=0"), /ajout seul/);
  const chain = await one<{ broken_at: number | null }>(db, "SELECT broken_at FROM app.fin_verify_chain($1)", [R]);
  assert.equal(chain.broken_at, null);
});

test("droits : salle, public et autre établissement sans accès, sous le rôle applicatif", async () => {
  const salle = asApp("sarah");
  const visitor = asApp("", true);
  await assert.rejects(salle((tx) => bankState(tx, R, waiter)), /refusé/);
  await assert.rejects(importStatement(salle, R, waiter, account, csv(["02/11/2026;X;1"]), "x.csv"), /refusé/);
  await assert.rejects(salle((tx) => bankAction(tx, R, waiter, { action: "autoMatch", enabled: true })), /refusé/);
  for (const table of ["fin_bank_accounts", "fin_bank_imports", "fin_bank_transactions", "fin_bank_matches", "fin_bank_match_targets"]) {
    assert.equal((await salle((tx: DB) => rows(tx, `SELECT * FROM ${table}`))).length, 0, table);
    assert.equal((await visitor((tx: DB) => rows(tx, `SELECT * FROM ${table}`))).length, 0, table);
  }
  assert.equal((await salle((tx: DB) => tx.query("UPDATE fin_bank_transactions SET status='ignored'"))).affectedRows, 0);
  await assert.rejects(salle((tx: DB) => tx.query("SELECT app.fin_reverse_event($1,'x','motif assez long')", [R])), /refusé/);
  await assert.rejects(web((tx: DB) => tx.query("INSERT INTO fin_bank_accounts(id,restaurant_id,label) VALUES($1,'atelier','Intrus')", [randomUUID()])));
});

test("migration : descente refusée avec des données, puis cycle complet à vide", async () => {
  await assert.rejects(db.exec(await readFile("database/migrations/down/039_bank_reconciliation.sql", "utf8")), /Retour arrière refusé/);
  const scratch = new PGlite();
  try {
    await scratch.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(scratch);
    await scratch.exec(
      await readFile("database/migrations/down/041_sales_invoices.sql", "utf8"),
    );
    await scratch.exec(
      await readFile("database/migrations/down/040_hr_payroll.sql", "utf8"),
    );
    await scratch.exec(await readFile("database/migrations/down/039_bank_reconciliation.sql", "utf8"));
    assert.equal((await scratch.query<{ t: string | null }>("SELECT to_regclass('public.fin_bank_transactions')::text AS t")).rows[0].t, null);
    await migrate(scratch);
    assert.equal((await scratch.query<{ t: string | null }>("SELECT to_regclass('public.fin_bank_transactions')::text AS t")).rows[0].t, "fin_bank_transactions");
  } finally {
    await scratch.close();
  }
});
