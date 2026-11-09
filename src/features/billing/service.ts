/* Factures clients et avoirs. Une facture émise ne se modifie plus. Sa numérotation est
   continue, et l’émission se fait à la date du jour pour rester chronologique.
   Facture tirée d’une vente encaissée : la vente est déjà comptabilisée, le document n’en
   crée pas une seconde. Facture manuelle : elle crée sa vente et sa créance client. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scope, type Actor } from "@/lib/auth/session";
import { one, rows, type DB } from "@/lib/database/db";
import { requirePermission } from "@/lib/permissions";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { log } from "@/features/orders/service";
import { ensureDefaults } from "@/features/finance/service";
import { declarationItems } from "@/features/finance/books";
import { allocate, splitVat } from "@/features/finance/posting";
import type { DocumentCompany, DocumentInvoice, FecRow } from "./documents";

type Line = {
  label: string;
  quantity: number;
  unit_gross: number;
  line_gross: number;
  rate_id: string | null;
  rate_bp: number;
  source_line?: number | null;
};
type Invoice = {
  id: string;
  kind: "invoice" | "credit_note";
  number: string | null;
  status: "draft" | "issued" | "paid" | "discarded";
  customer_name: string;
  customer_address: string;
  customer_siren: string | null;
  customer_vat: string | null;
  is_business: boolean;
  service_date: string;
  issue_date: string | null;
  due_date: string | null;
  net: number;
  vat: number;
  gross: number;
  applied: number;
  vat_regime: string;
  source_payment_id: string | null;
  credits_invoice_id: string | null;
  company: DocumentCompany | null;
  note: string;
};
const columns =
  "id,kind,number,status,customer_name,customer_address,customer_siren,customer_vat,is_business,service_date::text,issue_date::text,due_date::text,net,vat,gross,applied,vat_regime,source_payment_id,credits_invoice_id,company,note";

async function access(db: DB, r: string, user: Actor) {
  const scoped = await scope(db, user, r);
  requirePermission(scoped.roles ?? scoped.role, "finance");
  await requirePaidAddon(db,r,"client-invoices");
  return scoped;
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(),
  );
const addDays = (day: string, by: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400_000)
    .toISOString()
    .slice(0, 10);

/** Totaux par taux. La TVA se calcule sur chaque taux, pour que la somme retombe sur le TTC. */
export function taxSummary(lines: Pick<Line, "line_gross" | "rate_bp">[]) {
  const byRate = new Map<number, number>();
  for (const l of lines)
    byRate.set(l.rate_bp, (byRate.get(l.rate_bp) ?? 0) + l.line_gross);
  const taxes = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate_bp, gross]) => ({ rate_bp, ...splitVat(gross, rate_bp) }));
  return {
    taxes,
    net: taxes.reduce((s, t) => s + t.net, 0),
    vat: taxes.reduce((s, t) => s + t.vat, 0),
    gross: taxes.reduce((s, t) => s + t.net + t.vat, 0),
  };
}
const linesOf = (db: DB, id: string) =>
  rows<Line & { line_no: number }>(
    db,
    "SELECT line_no,label,quantity::float AS quantity,unit_gross,line_gross,rate_id,rate_bp,source_line FROM fin_invoice_lines WHERE invoice_id=$1 ORDER BY line_no",
    [id],
  );
const lock = (db: DB, r: string, id: string) =>
  one<Invoice>(
    db,
    `SELECT ${columns} FROM fin_invoices WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
    [id, r],
  );

async function regimeOf(db: DB, r: string) {
  const { vat_regime } = await one<{ vat_regime: string }>(
    db,
    "SELECT vat_regime FROM fin_settings WHERE restaurant_id=$1",
    [r],
  );
  if (vat_regime === "unknown")
    throw new Error(
      "Déclarez d’abord le régime de TVA dans Opérations à vérifier.",
    );
  return vat_regime;
}
/** Ce qui reste à payer par le client, ou à lui rembourser pour un avoir. */
async function dueOf(
  db: DB,
  i: Pick<Invoice, "id" | "kind" | "gross" | "applied">,
) {
  const { paid } = await one<{ paid: number }>(
    db,
    "SELECT coalesce(sum(amount),0)::int AS paid FROM fin_invoice_payments WHERE invoice_id=$1 AND voided_at IS NULL",
    [i.id],
  );
  if (i.kind === "credit_note") return i.gross - i.applied - paid;
  const { credited } = await one<{ credited: number }>(
    db,
    "SELECT coalesce(sum(applied),0)::int AS credited FROM fin_invoices WHERE credits_invoice_id=$1 AND status IN ('issued','paid')",
    [i.id],
  );
  return i.gross - paid - credited;
}

async function nextNumber(db: DB, r: string, series: "F" | "AV", year: number) {
  const { last_number } = await one<{ last_number: number }>(
    db,
    `INSERT INTO fin_invoice_sequences(restaurant_id,series,year,last_number) VALUES($1,$2,$3,1)
     ON CONFLICT(restaurant_id,series,year) DO UPDATE SET last_number=fin_invoice_sequences.last_number+1
     RETURNING last_number`,
    [r, series, year],
  );
  return `${series}-${year}-${String(last_number).padStart(6, "0")}`;
}

/** Écriture de vente ou d’avoir, à partir des totaux par taux. Sens inversé pour un avoir. */
async function postSale(
  db: DB,
  r: string,
  i: Invoice & { number: string },
  lines: Line[],
  day: string,
) {
  const credit = i.kind === "credit_note";
  const settings = await one<{ sales_account: string }>(
    db,
    "SELECT sales_account FROM fin_settings WHERE restaurant_id=$1",
    [r],
  );
  const side = (account: string, amount: number, label: string) => ({
    account,
    debit: credit ? amount : 0,
    credit: credit ? 0 : amount,
    label,
  });
  const entries = [];
  if (i.vat_regime === "franchise")
    entries.push(side(settings.sales_account, i.gross, "Ventes sans TVA"));
  else {
    const rates = await rows<{
      id: string;
      sales_account: string;
      vat_account: string;
    }>(
      db,
      "SELECT id,sales_account,vat_account FROM fin_tax_rates WHERE id=ANY($1::text[]) AND restaurant_id=$2",
      [[...new Set(lines.map((l) => l.rate_id).filter(Boolean))], r],
    );
    const byRate = new Map<string, number>();
    for (const l of lines)
      byRate.set(l.rate_id!, (byRate.get(l.rate_id!) ?? 0) + l.line_gross);
    for (const [rateId, gross] of byRate) {
      const rate = rates.find((x) => x.id === rateId)!;
      const bp = lines.find((l) => l.rate_id === rateId)!.rate_bp;
      const { net, vat } = splitVat(gross, bp);
      if (net) entries.push(side(rate.sales_account, net, "Ventes"));
      if (vat) entries.push(side(rate.vat_account, vat, "TVA collectée"));
    }
  }
  const client = {
    account: "411",
    debit: credit ? 0 : i.gross,
    credit: credit ? i.gross : 0,
    label: "Client",
  };
  await db.query(
    "SELECT app.fin_post_invoice($1,$2,$3,$4,$5,$6,$7,$8::date,$9,'VE')",
    [
      r,
      `sale-${i.kind}:${i.id}`,
      credit ? "sale_credit.issued" : "sale_invoice.issued",
      i.id,
      i.gross,
      credit ? "sale_credit" : "sale_invoice",
      `${credit ? "Avoir" : "Facture"} ${i.number}`,
      day,
      JSON.stringify(
        [client, ...entries].filter((l) => l.debit + l.credit > 0),
      ),
    ],
  );
}

const accountFor = { bank: "512", card: "5115", cash: "530" } as const;
/** Paiement d’une facture, ou remboursement d’un avoir. */
export async function recordPayment(
  db: DB,
  r: string,
  userId: string,
  invoiceId: string,
  amount: number,
  paidOn: string,
  method: "bank" | "card" | "cash",
  bankTransaction: string | null = null,
) {
  const i = await lock(db, r, invoiceId);
  if (i.status === "draft" || i.status === "discarded")
    throw new Error("Cette facture n’est pas émise.");
  const due = await dueOf(db, i);
  if (due <= 0) throw new Error("Rien à régler sur ce document.");
  if (amount > due)
    throw new Error(
      `Le montant dépasse ce qui reste dû (${(due / 100).toFixed(2)} €).`,
    );
  const payment = randomUUID();
  await db.query(
    "INSERT INTO fin_invoice_payments(id,restaurant_id,invoice_id,amount,paid_on,method,bank_transaction_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [payment, r, invoiceId, amount, paidOn, method, bankTransaction, userId],
  );
  const refund = i.kind === "credit_note";
  await db.query(
    "SELECT app.fin_post_invoice($1,$2,'sale_invoice.paid',$3,$4,'sale_invoice_payment',$5,$6::date,$7,'BQ')",
    [
      r,
      `sale-invoice-paid:${payment}`,
      payment,
      amount,
      `${refund ? "Remboursement" : "Règlement"} ${i.number}`,
      paidOn,
      JSON.stringify(
        refund
          ? [
              { account: "411", debit: amount, credit: 0, label: "Client" },
              {
                account: accountFor[method],
                debit: 0,
                credit: amount,
                label: "Remboursement",
              },
            ]
          : [
              {
                account: accountFor[method],
                debit: amount,
                credit: 0,
                label: "Règlement",
              },
              { account: "411", debit: 0, credit: amount, label: "Client" },
            ],
      ),
    ],
  );
  if (amount === due)
    await db.query("UPDATE fin_invoices SET status='paid' WHERE id=$1", [
      invoiceId,
    ]);
  await log(
    db,
    r,
    userId,
    `${refund ? "Remboursement" : "Règlement"} enregistré`,
    invoiceId,
  );
  return payment;
}
/** Annule le règlement lié à un mouvement bancaire, quand le rapprochement est défait. */
export async function voidBankPayment(
  db: DB,
  r: string,
  bankTransaction: string,
  reason: string,
) {
  const payment = await one<{ id: string; invoice_id: string }>(
    db,
    "SELECT id,invoice_id FROM fin_invoice_payments WHERE restaurant_id=$1 AND bank_transaction_id=$2 AND voided_at IS NULL",
    [r, bankTransaction],
  );
  await db.query("SELECT app.fin_reverse_event($1,$2,$3)", [
    r,
    `sale-invoice-paid:${payment.id}`,
    reason,
  ]);
  await db.query(
    "UPDATE fin_invoice_payments SET voided_at=now() WHERE id=$1",
    [payment.id],
  );
  await db.query(
    "UPDATE fin_invoices SET status='issued' WHERE id=$1 AND status='paid'",
    [payment.invoice_id],
  );
}

const customer = {
  customerName: z.string().trim().min(1).max(200),
  customerAddress: z.string().trim().max(300).default(""),
  customerSiren: z
    .string()
    .regex(/^\d{9}$/, "SIREN invalide : 9 chiffres.")
    .nullable()
    .default(null),
  customerVat: z.string().trim().max(40).nullable().default(null),
  isBusiness: z.boolean().default(false),
  note: z.string().trim().max(500).default(""),
};
const id = z.string().min(1).max(100);
const date = z.iso.date();
export const billingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("company"),
    legalName: z.string().trim().min(1).max(200),
    legalForm: z.string().trim().max(60).default(""),
    address: z.string().trim().min(5).max(300),
    siren: z.string().regex(/^\d{9}$/, "SIREN invalide : 9 chiffres."),
    vatNumber: z.string().trim().max(40).nullable().default(null),
    shareCapital: z.string().trim().max(60).default(""),
    rcs: z.string().trim().max(100).default(""),
    paymentDays: z.number().int().min(0).max(60).default(30),
    latePenalty: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal("draft"),
    ...customer,
    serviceDate: date,
    lines: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(300),
          quantity: z.number().positive().max(100000),
          unitGross: z.number().int().min(0).max(100_000_000),
          rateId: id.nullable(),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({ action: z.literal("issue"), id }),
  z.object({ action: z.literal("discard"), id }),
  z.object({ action: z.literal("fromPayment"), paymentId: id, ...customer }),
  z.object({
    action: z.literal("pay"),
    id,
    amount: z.number().int().positive().max(100_000_000),
    paidOn: date,
    method: z.enum(["bank", "card", "cash"]),
  }),
  z.object({
    action: z.literal("credit"),
    id,
    note: z.string().trim().max(500).default(""),
    // Sans détail : la facture entière. Sinon, les quantités reprises par ligne.
    lines: z
      .array(
        z.object({
          line: z.number().int().positive(),
          quantity: z.number().positive(),
        }),
      )
      .max(100)
      .nullable()
      .default(null),
  }),
]);
type Action = z.infer<typeof billingActionSchema>;

async function companyOf(db: DB, r: string) {
  return (
    await rows<DocumentCompany & { payment_days: number }>(
      db,
      "SELECT legal_name,legal_form,address,siren,vat_number,share_capital,rcs,late_penalty,payment_days FROM fin_company WHERE restaurant_id=$1",
      [r],
    )
  )[0];
}
/** Émet un brouillon : contrôles, numéro continu, identité figée. */
async function issue(db: DB, r: string, userId: string, draftId: string) {
  const draft = await lock(db, r, draftId);
  if (draft.status !== "draft")
    throw new Error("Cette facture a déjà été traitée.");
  const company = await companyOf(db, r);
  if (!company)
    throw new Error("Renseignez d’abord l’identité de votre établissement.");
  if (draft.vat_regime === "normal" && !company.vat_number)
    throw new Error("Renseignez votre numéro de TVA intracommunautaire.");
  if (draft.is_business && !draft.customer_siren)
    throw new Error("Le SIREN du client professionnel est requis.");
  if (draft.is_business && !draft.customer_address)
    throw new Error("L’adresse du client professionnel est requise.");
  const lines = await linesOf(db, draftId);
  if (!lines.length) throw new Error("Cette facture n’a aucune ligne.");
  const totals = taxSummary(lines);
  if (totals.gross <= 0)
    throw new Error("Le montant de la facture doit être positif.");
  const day = today();
  const number = await nextNumber(
    db,
    r,
    draft.kind === "invoice" ? "F" : "AV",
    Number(day.slice(0, 4)),
  );
  const due =
    draft.kind === "invoice" && !draft.source_payment_id
      ? addDays(day, company.payment_days)
      : null;
  await db.query(
    "UPDATE fin_invoices SET number=$2,status='issued',issue_date=$3,due_date=$4,net=$5,vat=$6,gross=$7,company=$8,issued_by=$9 WHERE id=$1",
    [
      draftId,
      number,
      day,
      due,
      totals.net,
      totals.vat,
      totals.gross,
      JSON.stringify(company),
      userId,
    ],
  );
  await log(db, r, userId, `Document émis : ${number}`, draftId);
  return {
    ...draft,
    number,
    issue_date: day,
    due_date: due,
    net: totals.net,
    vat: totals.vat,
    gross: totals.gross,
    lines,
  };
}

async function insertLines(db: DB, invoice: string, lines: Line[]) {
  let n = 0;
  for (const l of lines) {
    n += 1;
    await db.query(
      "INSERT INTO fin_invoice_lines(invoice_id,line_no,label,quantity,unit_gross,line_gross,rate_id,rate_bp,source_line) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        invoice,
        n,
        l.label,
        l.quantity,
        l.unit_gross,
        l.line_gross,
        l.rate_id,
        l.rate_bp,
        l.source_line ?? null,
      ],
    );
  }
}

export async function billingAction(
  db: DB,
  r: string,
  rawUser: Actor,
  a: Action,
) {
  const user = await access(db, r, rawUser);
  await ensureDefaults(db, r);
  switch (a.action) {
    case "company":
      await db.query(
        `INSERT INTO fin_company(restaurant_id,legal_name,legal_form,address,siren,vat_number,share_capital,rcs,payment_days,late_penalty,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(restaurant_id) DO UPDATE SET legal_name=excluded.legal_name,legal_form=excluded.legal_form,address=excluded.address,siren=excluded.siren,vat_number=excluded.vat_number,share_capital=excluded.share_capital,rcs=excluded.rcs,payment_days=excluded.payment_days,late_penalty=excluded.late_penalty,updated_by=excluded.updated_by,updated_at=now()`,
        [
          r,
          a.legalName,
          a.legalForm,
          a.address,
          a.siren,
          a.vatNumber,
          a.shareCapital,
          a.rcs,
          a.paymentDays,
          a.latePenalty,
          user.id,
        ],
      );
      await log(db, r, user.id, "Identité de facturation mise à jour");
      return {};
    case "draft": {
      const regime = await regimeOf(db, r);
      const lines: Line[] = [];
      for (const l of a.lines) {
        let rate: { id: string; rate_bp: number } | null = null;
        if (regime === "normal") {
          if (!l.rateId)
            throw new Error(`Taux de TVA à préciser : ${l.label}.`);
          rate = await one<{ id: string; rate_bp: number }>(
            db,
            "SELECT id,rate_bp FROM fin_tax_rates WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL",
            [l.rateId, r],
          );
        }
        lines.push({
          label: l.label,
          quantity: l.quantity,
          unit_gross: l.unitGross,
          line_gross: Math.round(l.quantity * l.unitGross),
          rate_id: rate?.id ?? null,
          rate_bp: rate?.rate_bp ?? 0,
        });
      }
      const invoice = randomUUID();
      await db.query(
        "INSERT INTO fin_invoices(id,restaurant_id,kind,customer_name,customer_address,customer_siren,customer_vat,is_business,service_date,vat_regime,note,created_by) VALUES($1,$2,'invoice',$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          invoice,
          r,
          a.customerName,
          a.customerAddress,
          a.customerSiren,
          a.customerVat,
          a.isBusiness,
          a.serviceDate,
          regime,
          a.note,
          user.id,
        ],
      );
      await insertLines(db, invoice, lines);
      const totals = taxSummary(lines);
      await db.query(
        "UPDATE fin_invoices SET net=$2,vat=$3,gross=$4 WHERE id=$1",
        [invoice, totals.net, totals.vat, totals.gross],
      );
      return { id: invoice };
    }
    case "issue": {
      const issued = await issue(db, r, user.id, a.id);
      await postSale(db, r, issued, issued.lines, issued.issue_date);
      return { number: issued.number };
    }
    case "discard": {
      const draft = await lock(db, r, a.id);
      if (draft.status !== "draft")
        throw new Error("Une facture émise se corrige par un avoir.");
      await db.query("UPDATE fin_invoices SET status='discarded' WHERE id=$1", [
        a.id,
      ]);
      return {};
    }
    case "fromPayment": {
      const regime = await regimeOf(db, r);
      const p = await one<{
        id: string;
        session_id: string | null;
        order_id: string | null;
        amount: number;
        discount: number;
        method: "card" | "cash" | "other" | "online";
        day: string;
      }>(
        db,
        `SELECT p.id,p.session_id,p.order_id,p.amount,p.discount,p.method,to_char(p.created_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day
           FROM payment_declarations p
           LEFT JOIN orders o ON o.id=p.order_id
           LEFT JOIN table_sessions s ON s.id=p.session_id
           LEFT JOIN dining_tables t ON t.id=s.table_id
          WHERE p.id=$1 AND coalesce(o.restaurant_id,t.restaurant_id)=$2`,
        [a.paymentId, r],
      );
      if (p.amount <= 0)
        throw new Error("Ce règlement n’a aucun montant à facturer.");
      const taken = await rows(
        db,
        "SELECT id FROM fin_invoices WHERE restaurant_id=$1 AND source_payment_id=$2 AND kind='invoice' AND status<>'discarded'",
        [r, p.id],
      );
      if (taken.length) throw new Error("Ce règlement a déjà sa facture.");
      const items = await declarationItems(db, p);
      if (regime === "normal" && items.some((i) => i.vat_rate_bp === null))
        throw new Error(
          "Précisez d’abord la TVA de cette vente dans Opérations à vérifier.",
        );
      const lines: Line[] = items.map((i) => ({
        label: i.name,
        quantity: i.quantity,
        unit_gross: i.price,
        line_gross: i.price * i.quantity,
        rate_id: regime === "normal" ? i.vat_rate_id : null,
        rate_bp: regime === "normal" ? i.vat_rate_bp! : 0,
      }));
      if (p.discount > 0) {
        // Remise répartie par taux, sur le même principe que l’écriture de vente.
        const rates = [...new Set(lines.map((l) => l.rate_bp))];
        const totals = rates.map((bp) =>
          lines
            .filter((l) => l.rate_bp === bp)
            .reduce((s, l) => s + l.line_gross, 0),
        );
        allocate(p.discount, totals).forEach((part, n) => {
          if (part > 0)
            lines.push({
              label: "Remise",
              quantity: 1,
              unit_gross: -part,
              line_gross: -part,
              rate_id: lines.find((l) => l.rate_bp === rates[n])!.rate_id,
              rate_bp: rates[n],
            });
        });
      }
      const invoice = randomUUID();
      await db.query(
        "INSERT INTO fin_invoices(id,restaurant_id,kind,customer_name,customer_address,customer_siren,customer_vat,is_business,service_date,vat_regime,source_payment_id,note,created_by) VALUES($1,$2,'invoice',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          invoice,
          r,
          a.customerName,
          a.customerAddress,
          a.customerSiren,
          a.customerVat,
          a.isBusiness,
          p.day,
          regime,
          p.id,
          a.note,
          user.id,
        ],
      );
      await insertLines(db, invoice, lines);
      const issued = await issue(db, r, user.id, invoice);
      if (issued.gross !== p.amount)
        throw new Error(
          "Le total de la facture ne correspond pas au règlement.",
        );
      // Déjà encaissée et comptabilisée : acquittée, sans seconde écriture.
      await db.query(
        "INSERT INTO fin_invoice_payments(id,restaurant_id,invoice_id,amount,paid_on,method,created_by) VALUES($1,$2,$3,$4,$5,'sale',$6)",
        [randomUUID(), r, invoice, p.amount, p.day, user.id],
      );
      await db.query("UPDATE fin_invoices SET status='paid' WHERE id=$1", [
        invoice,
      ]);
      return { id: invoice, number: issued.number };
    }
    case "pay":
      return {
        payment: await recordPayment(
          db,
          r,
          user.id,
          a.id,
          a.amount,
          a.paidOn,
          a.method,
        ),
      };
    case "credit": {
      const invoice = await lock(db, r, a.id);
      if (
        invoice.kind !== "invoice" ||
        !["issued", "paid"].includes(invoice.status)
      )
        throw new Error("Seule une facture émise peut recevoir un avoir.");
      const original = await linesOf(db, invoice.id);
      const already = await rows<{ source_line: number; quantity: number }>(
        db,
        `SELECT l.source_line,sum(l.quantity)::float AS quantity FROM fin_invoice_lines l JOIN fin_invoices c ON c.id=l.invoice_id
          WHERE c.credits_invoice_id=$1 AND c.status IN ('issued','paid') GROUP BY l.source_line`,
        [invoice.id],
      );
      const left = (n: number, q: number) =>
        q - (already.find((x) => x.source_line === n)?.quantity ?? 0);
      const wanted =
        a.lines ??
        original
          .map((l) => ({
            line: l.line_no,
            quantity: left(l.line_no, l.quantity),
          }))
          .filter((l) => l.quantity > 0);
      if (!wanted.length)
        throw new Error("Cette facture est déjà entièrement créditée.");
      const lines: Line[] = wanted.map((w) => {
        const source = original.find((l) => l.line_no === w.line);
        if (!source) throw new Error("Ligne inconnue sur cette facture.");
        if (w.quantity > left(source.line_no, source.quantity) + 1e-9)
          throw new Error(`Quantité trop élevée : ${source.label}.`);
        return {
          label: source.label,
          quantity: w.quantity,
          unit_gross: source.unit_gross,
          line_gross: Math.round(
            (source.line_gross * w.quantity) / source.quantity,
          ),
          rate_id: source.rate_id,
          rate_bp: source.rate_bp,
          source_line: source.line_no,
        };
      });
      const totals = taxSummary(lines);
      if (totals.gross <= 0)
        throw new Error("Le montant de cet avoir doit être positif.");
      const due = await dueOf(db, invoice);
      // Vente en ligne déjà remboursée : Stripe et les écritures l’ont déjà soldée.
      const refundedOnline = invoice.source_payment_id
        ? (
            await rows(
              db,
              "SELECT 1 FROM online_payments op JOIN payment_declarations d ON d.order_id=op.order_id WHERE d.id=$1 AND op.status='refunded'",
              [invoice.source_payment_id],
            )
          ).length > 0
        : false;
      const applied = refundedOnline
        ? totals.gross
        : Math.min(Math.max(due, 0), totals.gross);
      const credit = randomUUID();
      await db.query(
        "INSERT INTO fin_invoices(id,restaurant_id,kind,customer_name,customer_address,customer_siren,customer_vat,is_business,service_date,vat_regime,credits_invoice_id,note,applied,created_by) VALUES($1,$2,'credit_note',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [
          credit,
          r,
          invoice.customer_name,
          invoice.customer_address,
          invoice.customer_siren,
          invoice.customer_vat,
          invoice.is_business,
          invoice.service_date,
          invoice.vat_regime,
          invoice.id,
          a.note,
          applied,
          user.id,
        ],
      );
      await insertLines(db, credit, lines);
      const issued = await issue(db, r, user.id, credit);
      if (!refundedOnline)
        await postSale(db, r, issued, issued.lines, issued.issue_date);
      if (applied === issued.gross)
        await db.query("UPDATE fin_invoices SET status='paid' WHERE id=$1", [
          credit,
        ]);
      if (invoice.status === "issued" && (await dueOf(db, invoice)) <= 0)
        await db.query("UPDATE fin_invoices SET status='paid' WHERE id=$1", [
          invoice.id,
        ]);
      return {
        id: credit,
        number: issued.number,
        toRefund: issued.gross - applied,
      };
    }
  }
}

export async function billingState(db: DB, r: string, user: Actor) {
  await access(db, r, user);
  await ensureDefaults(db, r);
  const list = await rows<Invoice>(
    db,
    `SELECT ${columns} FROM fin_invoices WHERE restaurant_id=$1 AND status<>'discarded' ORDER BY created_at DESC LIMIT 100`,
    [r],
  );
  const invoices = [];
  for (const i of list)
    invoices.push({
      ...i,
      company: undefined,
      lines: await linesOf(db, i.id),
      due: i.status === "draft" ? i.gross : await dueOf(db, i),
    });
  return {
    company: (await companyOf(db, r)) ?? null,
    regime: (
      await one<{ vat_regime: string }>(
        db,
        "SELECT vat_regime FROM fin_settings WHERE restaurant_id=$1",
        [r],
      )
    ).vat_regime,
    rates: await rows(
      db,
      "SELECT id,label,rate_bp FROM fin_tax_rates WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY rate_bp",
      [r],
    ),
    invoices,
    // Ventes encaissées encore sans facture.
    payments: await rows(
      db,
      `SELECT p.id,p.amount,p.method,to_char(p.created_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day
         FROM payment_declarations p
         LEFT JOIN orders o ON o.id=p.order_id
         LEFT JOIN table_sessions s ON s.id=p.session_id
         LEFT JOIN dining_tables t ON t.id=s.table_id
        WHERE coalesce(o.restaurant_id,t.restaurant_id)=$1 AND p.amount>0
          AND NOT EXISTS(SELECT 1 FROM fin_invoices i WHERE i.restaurant_id=$1 AND i.source_payment_id=p.id AND i.status<>'discarded')
        ORDER BY p.created_at DESC LIMIT 30`,
      [r],
    ),
  };
}

/** Données figées d’un document. Un brouillon n’a pas d’existence officielle. */
export async function documentData(
  db: DB,
  r: string,
  user: Actor,
  invoiceId: string,
): Promise<DocumentInvoice> {
  await access(db, r, user);
  const i = await one<Invoice>(
    db,
    `SELECT ${columns} FROM fin_invoices WHERE id=$1 AND restaurant_id=$2`,
    [invoiceId, r],
  );
  if (!i.number || !i.issue_date || !i.company)
    throw new Error("Émettez d’abord ce document.");
  const lines = await linesOf(db, i.id);
  const credited = i.credits_invoice_id
    ? (
        await one<{ number: string }>(
          db,
          "SELECT number FROM fin_invoices WHERE id=$1",
          [i.credits_invoice_id],
        )
      ).number
    : null;
  return {
    kind: i.kind,
    number: i.number,
    customer_name: i.customer_name,
    customer_address: i.customer_address,
    customer_siren: i.customer_siren,
    customer_vat: i.customer_vat,
    is_business: i.is_business,
    service_date: i.service_date,
    issue_date: i.issue_date,
    due_date: i.due_date,
    net: i.net,
    vat: i.vat,
    gross: i.gross,
    vat_regime: i.vat_regime,
    note: i.note,
    company: i.company,
    lines,
    taxes: taxSummary(lines).taxes,
    credited_number: credited,
    paid: i.status === "paid",
  };
}
/** Écritures d’une période pour l’expert-comptable. Pas un FEC officiel d’un logiciel comptable. */
export async function fecRows(
  db: DB,
  r: string,
  user: Actor,
  from: string,
  to: string,
): Promise<FecRow[]> {
  const scoped = await access(db, r, user);
  const data = await rows<FecRow>(
    db,
    `SELECT n.journal,n.number,n.entry_date::text,l.account_code,a.label AS account_label,
            coalesce(si.number,paid.number,sup.invoice_number,e.source_id) AS piece,
            coalesce(nullif(l.label,''),n.label) AS label,l.debit,l.credit
       FROM fin_entry_lines l
       JOIN fin_entries n ON n.id=l.entry_id
       JOIN fin_events e ON e.id=n.event_id
       JOIN fin_accounts a ON a.restaurant_id=l.restaurant_id AND a.code=l.account_code
       LEFT JOIN fin_invoices si ON si.restaurant_id=e.restaurant_id AND si.id=e.source_id
       LEFT JOIN fin_invoice_payments ip ON ip.restaurant_id=e.restaurant_id AND ip.id=e.source_id
       LEFT JOIN fin_invoices paid ON paid.restaurant_id=ip.restaurant_id AND paid.id=ip.invoice_id
       LEFT JOIN fin_supplier_invoices sup ON sup.restaurant_id=e.restaurant_id AND sup.id=e.source_id
      WHERE l.restaurant_id=$1 AND n.entry_date BETWEEN $2::date AND $3::date
      ORDER BY n.number,l.line_no LIMIT 200000`,
    [r, from, to],
  );
  await log(db, r, scoped.id, `Export des écritures : ${from} au ${to}`);
  return data.map((row) => ({
    ...row,
    debit: Number(row.debit),
    credit: Number(row.credit),
    number: Number(row.number),
  }));
}
/** Créances clients à ce jour, pour le tableau de bord. */
export async function receivables(db: DB, r: string) {
  const list = await rows<
    Pick<Invoice, "id" | "kind" | "gross" | "applied"> & {
      due_date: string | null;
    }
  >(
    db,
    "SELECT id,kind,gross,applied,due_date::text FROM fin_invoices WHERE restaurant_id=$1 AND kind='invoice' AND status='issued'",
    [r],
  );
  let total = 0,
    overdue = 0;
  const now = today();
  for (const i of list) {
    const due = await dueOf(db, i);
    total += due;
    if (i.due_date && i.due_date < now) overdue += 1;
  }
  return { total, count: list.length, overdue };
}
