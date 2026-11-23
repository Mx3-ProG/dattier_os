/* Indicateurs financiers d’une période. Chaque chiffre dit d’où il vient :
   confirmé, incomplet, estimé ou indisponible. Aucun chiffre n’est complété par
   supposition, et chiffre d’affaires, encaissements et trésorerie restent séparés. */
import { z } from "zod";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { requireCommercialCapability } from "@/features/platform/entitlements";
import { bankTreasury } from "@/features/bank/service";
import { staffCost } from "@/features/hr/service";
import { receivables } from "@/features/billing/service";

export type MetricStatus = "confirmed" | "partial" | "estimate" | "missing";
export type Metric = {
  value: number | null;
  status: MetricStatus;
  note: string;
};

export const periodQuery = z
  .object({
    period: z
      .enum(["today", "week", "month", "year", "custom"])
      .default("month"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .superRefine((q, c) => {
    if (q.period !== "custom") return;
    if (!q.from || !q.to || q.from > q.to)
      c.addIssue({ code: "custom", message: "Période invalide." });
    else if ((Date.parse(q.to) - Date.parse(q.from)) / 86400_000 > 1830)
      c.addIssue({ code: "custom", message: "Période trop longue." });
  });
export type PeriodQuery = z.input<typeof periodQuery>;

const parisDate = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);

/** Bornes de la période, en jours du calendrier de Paris. */
export function resolvePeriod(q: PeriodQuery, now = new Date()) {
  const parsed = periodQuery.parse(q);
  if (parsed.period === "custom")
    return { period: "custom", from: parsed.from!, to: parsed.to! };
  const to = parisDate(now);
  const day = new Date(`${to}T00:00:00Z`);
  if (parsed.period === "today") return { period: "today", from: to, to };
  if (parsed.period === "week") {
    const monday = new Date(day);
    monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return { period: "week", from: monday.toISOString().slice(0, 10), to };
  }
  return parsed.period === "month"
    ? { period: "month", from: `${to.slice(0, 7)}-01`, to }
    : { period: "year", from: `${to.slice(0, 4)}-01-01`, to };
}

const missing = (note: string): Metric => ({
  value: null,
  status: "missing",
  note,
});

export async function financeDashboard(
  db: DB,
  r: string,
  user: Actor,
  query: PeriodQuery,
  now = new Date(),
) {
  const scoped = await scope(db, user, r);
  requirePermission(scoped.roles ?? scoped.role, "finance");
  await requireCommercialCapability(db, r, "finance");
  const { period, from, to } = resolvePeriod(query, now);
  const range = [r, from, to];
  // Une vente en ligne remboursée n’est plus un encaissement.
  const paid = `payment_declarations p
    LEFT JOIN orders o ON o.id=p.order_id
    LEFT JOIN table_sessions s ON s.id=p.session_id
    LEFT JOIN dining_tables t ON t.id=s.table_id
    LEFT JOIN online_payments op ON op.order_id=p.order_id
    WHERE coalesce(o.restaurant_id,t.restaurant_id)=$1
      AND (p.created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date
      AND coalesce(op.status,'')<>'refunded'`;
  const methods = await rows<{ method: string; total: number; count: number }>(
    db,
    `SELECT p.method,sum(p.amount)::int AS total,count(*)::int AS count FROM ${paid} GROUP BY p.method ORDER BY p.method`,
    range,
  );
  const daily = await rows<{ day: string; total: number }>(
    db,
    `SELECT to_char(p.created_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day,sum(p.amount)::int AS total FROM ${paid} GROUP BY 1 ORDER BY 1`,
    range,
  );
  const settings = (
    await rows<{ vat_regime: string; sales_account: string }>(
      db,
      "SELECT vat_regime,sales_account FROM fin_settings WHERE restaurant_id=$1",
      [r],
    )
  )[0];
  const books = await one<{ net: number; vat: number }>(
    db,
    `SELECT coalesce(sum(l.credit-l.debit) FILTER (WHERE l.account_code IN (SELECT sales_account FROM fin_tax_rates WHERE restaurant_id=$1) OR l.account_code=(SELECT sales_account FROM fin_settings WHERE restaurant_id=$1)),0)::int AS net,
            coalesce(sum(l.credit-l.debit) FILTER (WHERE l.account_code IN (SELECT vat_account FROM fin_tax_rates WHERE restaurant_id=$1)),0)::int AS vat
       FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id
      WHERE l.restaurant_id=$1 AND n.kind IN ('sale_payment','sale_invoice','sale_credit','reversal') AND n.entry_date BETWEEN $2::date AND $3::date`,
    range,
  );
  // Règlements de la période sans écriture active : le chiffre d’affaires est alors incomplet.
  const uncovered = await one<{ count: number; total: number }>(
    db,
    `SELECT count(*)::int AS count,coalesce(sum(e.amount),0)::int AS total
       FROM fin_events e
       LEFT JOIN payment_declarations d ON 'payment:'||d.id=e.dedupe_key
       LEFT JOIN online_payments op ON op.order_id=d.order_id
      WHERE e.restaurant_id=$1 AND e.type='payment.confirmed' AND e.amount>0
        AND (e.occurred_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date
        AND coalesce(op.status,'')<>'refunded'
        AND NOT EXISTS(SELECT 1 FROM fin_entries n WHERE n.event_id=e.id AND n.kind='sale_payment' AND NOT EXISTS(SELECT 1 FROM fin_entries x WHERE x.reverses_entry_id=n.id))
        AND NOT EXISTS(SELECT 1 FROM fin_review_items v WHERE v.event_id=e.id AND v.status='dismissed')`,
    range,
  );
  const expenses = await one<{ total: number }>(
    db,
    "SELECT coalesce(sum(amount),0)::int AS total FROM expenses WHERE restaurant_id=$1 AND (created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date",
    range,
  );
  const material = await one<{ total: number }>(
    db,
    `SELECT round(coalesce(sum(i.material_cost*i.quantity),0)*100)::int AS total
       FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE o.restaurant_id=$1 AND o.status='paid' AND i.status='served'
        AND (o.created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date`,
    range,
  );
  const online = await one<{ fees: number; due: number }>(
    db,
    `SELECT coalesce(sum(commission+stripe_fee_estimate) FILTER (WHERE status NOT IN ('refunded','expired','pending') AND (paid_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date),0)::int AS fees,
            coalesce(sum(net) FILTER (WHERE status IN ('paid','disputed','manual_review')),0)::int AS due
       FROM online_payments WHERE restaurant_id=$1`,
    range,
  );

  const invoices = await one<{
    known: number;
    to_review: number;
    net: number;
    vat: number;
    merchandise: number;
    other_net: number;
    unpaid: number;
    unpaid_count: number;
    overdue: number;
  }>(
    db,
    `SELECT count(*)::int AS known,
        count(*) FILTER (WHERE status='to_review')::int AS to_review,
        coalesce(sum(net) FILTER (WHERE booked AND status IN ('validated','paid')),0)::int AS net,
        coalesce(sum(vat) FILTER (WHERE booked AND status IN ('validated','paid')),0)::int AS vat,
        coalesce(sum(net) FILTER (WHERE booked AND status IN ('validated','paid') AND category='merchandise'),0)::int AS merchandise,
        coalesce(sum(net) FILTER (WHERE booked AND status IN ('validated','paid') AND category<>'merchandise'),0)::int AS other_net,
        coalesce(sum(gross) FILTER (WHERE status='validated'),0)::int AS unpaid,
        count(*) FILTER (WHERE status='validated')::int AS unpaid_count,
        count(*) FILTER (WHERE status='validated' AND due_date<(now() AT TIME ZONE 'Europe/Paris')::date)::int AS overdue
       FROM (SELECT *,invoice_date BETWEEN $2::date AND $3::date AS booked FROM fin_supplier_invoices WHERE restaurant_id=$1) i`,
    range,
  );
  const topSuppliers = await rows<{ name: string; total: number }>(
    db,
    `SELECT supplier_name AS name,sum(net)::int AS total FROM fin_supplier_invoices
      WHERE restaurant_id=$1 AND status IN ('validated','paid') AND invoice_date BETWEEN $2::date AND $3::date
      GROUP BY supplier_name ORDER BY total DESC,name LIMIT 5`,
    range,
  );
  const toValidate = invoices.to_review
    ? ` ${invoices.to_review} facture(s) restent à valider et n’y figurent pas.`
    : "";
  const fromInvoices = (value: number, note: string): Metric =>
    invoices.known === 0
      ? missing("Aucune facture fournisseur déposée pour le moment.")
      : {
          value,
          status: invoices.to_review ? "partial" : "confirmed",
          note: note + toValidate,
        };
  const banks = await bankTreasury(db, r);
  const knownBanks = banks.filter((b) => b.balance !== null);
  const bankToReview = await one<{ count: number }>(
    db,
    "SELECT count(*)::int AS count FROM fin_bank_transactions WHERE restaurant_id=$1 AND status='to_review'",
    [r],
  );
  const lastBankDate = knownBanks
    .map((b) => b.asOf ?? "")
    .sort()
    .at(-1);
  const treasury: Metric = !banks.length
    ? missing("Disponible avec l’import des relevés bancaires.")
    : knownBanks.length < banks.length
      ? missing(
          "Solde inconnu : indiquez le solde de départ du compte ou importez un relevé qui le contient.",
        )
      : {
          value: knownBanks.reduce((s, b) => s + b.balance!, 0),
          status: "confirmed",
          note: `Solde bancaire au ${lastBankDate}, d’après les relevés importés. Hors espèces en caisse.`,
        };
  const staff = await staffCost(db, r, from, to);
  const staffValue = staff.loaded ?? staff.gross;
  const staffIncomplete =
    staff.unknownEmployees.length > 0 || staff.anomalies > 0;
  const staffMetric: Metric = !staff.contracts
    ? missing("Disponible avec les contrats et taux horaires.")
    : {
        value: staffValue,
        status: staffIncomplete ? "partial" : "estimate",
        note: [
          staff.loaded === null
            ? "Brut hors charges patronales."
            : "Avec charges patronales estimées.",
          "Heures pointées, hors congés payés.",
          staff.unknownEmployees.length
            ? `Sans contrat : ${staff.unknownEmployees.join(", ")}.`
            : "",
          staff.anomalies ? `${staff.anomalies} pointage(s) à corriger.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
  const owed = await receivables(db, r);
  const cash = methods.reduce((s, m) => s + m.total, 0),
    count = methods.reduce((s, m) => s + m.count, 0);
  const complete =
    uncovered.count === 0 && settings && settings.vat_regime !== "unknown";
  const pending = uncovered.count
    ? `${uncovered.count} règlement(s) restent à vérifier et n’y figurent pas.`
    : "";
  const fromBooks = (value: number, note: string): Metric =>
    !settings || settings.vat_regime === "unknown"
      ? missing("Déclarez le régime de TVA dans Opérations à vérifier.")
      : {
          value,
          status: uncovered.count ? "partial" : "confirmed",
          note: [note, pending].filter(Boolean).join(" "),
        };
  const franchise = settings?.vat_regime === "franchise";
  const margin = books.net - material.total;
  const metrics = {
    /** Argent déclaré reçu, TTC. Ce n’est ni un chiffre d’affaires, ni la trésorerie. */
    cash: {
      value: cash,
      status: "confirmed",
      note: `${count} règlement(s) déclaré(s), TTC.`,
    } as Metric,
    revenue: fromBooks(
      books.net,
      "Hors taxes, à partir des écritures préparées.",
    ),
    vatCollected: franchise
      ? missing("Sans objet : établissement en franchise de TVA.")
      : fromBooks(books.vat, "À partir des écritures préparées."),
    vatDeductible: franchise
      ? missing("Sans objet : établissement en franchise de TVA.")
      : fromInvoices(invoices.vat, "Factures validées de la période."),
    expenses: {
      value: expenses.total,
      status: "confirmed",
      note: "Dépenses déclarées, sans détail de TVA.",
    } as Metric,
    treasury,
    onlineDue: {
      value: online.due,
      status: "confirmed",
      note: "Ventes en ligne à recevoir, toutes dates.",
    } as Metric,
    unpaidInvoices: fromInvoices(
      invoices.unpaid,
      `${invoices.unpaid_count} facture(s) à régler, toutes dates${invoices.overdue ? `, dont ${invoices.overdue} en retard` : ""}.`,
    ),
    staffCost: staffMetric,
    receivables: owed.count
      ? ({
          value: owed.total,
          status: "confirmed",
          note: `${owed.count} facture(s) client à encaisser, toutes dates, ${owed.overdue ? `dont ${owed.overdue} en retard` : "aucune en retard"}.`,
        } as Metric)
      : missing("Aucune facture client à encaisser."),
    supplierCost: fromInvoices(
      invoices.net,
      "Factures validées de la période, hors taxes.",
    ),
    merchandiseCost: fromInvoices(
      invoices.merchandise,
      "Factures de marchandises validées de la période, hors taxes.",
    ),
    materialCost: {
      value: material.total,
      status: "estimate",
      note: "Théorique : recettes × coût des ingrédients, produits servis et réglés.",
    } as Metric,
    margin: complete
      ? ({
          value: margin,
          status: "estimate",
          note: "Chiffre d’affaires HT moins le coût matière théorique.",
        } as Metric)
      : missing(
          pending || "Déclarez le régime de TVA dans Opérations à vérifier.",
        ),
    resultBeforeStaff: complete
      ? ({
          value: margin - expenses.total - online.fees - invoices.other_net,
          status: "estimate",
          note: "Marge moins dépenses, commissions en ligne et factures hors marchandises. Hors personnel.",
        } as Metric)
      : missing(
          pending || "Déclarez le régime de TVA dans Opérations à vérifier.",
        ),
    forecastResult:
      complete && staffMetric.value !== null && !staffIncomplete
        ? ({
            value:
              margin -
              expenses.total -
              online.fees -
              invoices.other_net -
              staffMetric.value,
            status: "estimate",
            note: "Résultat avant personnel moins le coût de personnel estimé. Ce n’est pas le résultat comptable.",
          } as Metric)
        : missing(
            pending ||
              (staffMetric.value === null
                ? "Disponible avec les contrats et taux horaires."
                : "Complétez d’abord les pointages et les contrats manquants."),
          ),
    accountingResult: missing(
      "Le résultat comptable relève de votre expert-comptable.",
    ),
  };
  return {
    period,
    from,
    to,
    metrics,
    averageTicket: count ? Math.round(cash / count) : null,
    byMethod: methods,
    topSuppliers,
    invoicesToReview: invoices.to_review,
    bankToReview: bankToReview.count,
    daily,
  };
}
export type FinanceDashboard = Awaited<ReturnType<typeof financeDashboard>>;
