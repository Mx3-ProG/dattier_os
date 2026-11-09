/* Questions financières de STUDIO VOICE : réponses tirées des données réelles, avec leur
   niveau de fiabilité. Lecture seule. Le droit d’accès est revérifié à chaque lecture,
   et un chiffre absent est dit absent : il n’est jamais estimé en silence. */
import { euros, normalize } from "./text";
import type {
  FinanceDashboard,
  Metric,
  PeriodQuery,
} from "@/features/finance/dashboard";

export type FinanceIntent =
  | "cash"
  | "revenue"
  | "expenses"
  | "invoices"
  | "staff"
  | "suppliers"
  | "merchandise"
  | "treasury"
  | "receivables"
  | "margin"
  | "marginTrend"
  | "profit"
  | "vat";

const patterns: [FinanceIntent, RegExp][] = [
  ["marginTrend", /\bpourquoi\b.*\bmarge\b/],
  [
    "receivables",
    /\bfactures? (de |des )?clients?\b|\bclients?\b.*\b(doivent|impaye\w*|retard)\b/,
  ],
  [
    "treasury",
    /\btresorerie\b|\bsolde\b.*\b(banque|bancaire|compte)\b|\bcombien\b.*\b(en banque|sur le compte)\b/,
  ],
  ["merchandise", /\b(depense\w*|achete\w*)\b.*\bmarchandises?\b/],
  ["suppliers", /\bfournisseurs?\b.*\b(cher|chers|cout\w*)\b/],
  ["invoices", /\bfactures?\b.*\b(impaye\w*|payer|regler)\b|\bimpayes?\b/],
  [
    "staff",
    /\bcouts? (de |du |de la )?(personnel|equipe)\b|\bmasse salariale\b/,
  ],
  ["profit", /\b(benefice\w*|resultat\w*)\b/],
  ["margin", /\b(quel\w*|combien)\b.*\bmarge\b|\bma marge\b|\bnotre marge\b/],
  ["vat", /\b(combien|quel\w*)\b.*\btva\b|\btva collectee\b/],
  ["revenue", /\bchiffre d affaires?\b/],
  ["expenses", /\bcombien\b.*\bdepense\w*/],
  ["cash", /\b(combien|quel\w*)\b.*\bencaiss\w*/],
];
export function financeIntent(input: string): FinanceIntent | null {
  const text = normalize(input);
  return patterns.find(([, re]) => re.test(text))?.[0] ?? null;
}
export function periodIn(input: string, intent: FinanceIntent): PeriodQuery {
  const text = normalize(input);
  if (/\b(aujourd hui|ce jour|du jour)\b/.test(text))
    return { period: "today" };
  if (/\bsemaine\b/.test(text)) return { period: "week" };
  if (/\bannee\b/.test(text)) return { period: "year" };
  if (/\bmois\b/.test(text)) return { period: "month" };
  return { period: intent === "cash" ? "today" : "month" };
}
const periodLabels: Record<string, string> = {
  today: "aujourd’hui",
  week: "cette semaine",
  month: "ce mois-ci",
  year: "cette année",
  custom: "sur la période",
};
const qualifiers: Record<Metric["status"], string> = {
  confirmed: "",
  partial: " (incomplet)",
  estimate: " (estimation)",
  missing: "",
};
const line = (label: string, metric: Metric, when: string) =>
  metric.value === null
    ? `**${label}** : je ne peux pas encore le dire. ${metric.note}`
    : `**${label} ${when}**${qualifiers[metric.status]} : ${euros(metric.value)}. ${metric.note}`;

export function financeReply(
  intent: FinanceIntent,
  d: FinanceDashboard,
  previous?: FinanceDashboard,
) {
  const when = periodLabels[d.period];
  const m = d.metrics;
  switch (intent) {
    case "cash":
      return line("Encaissé", m.cash, when);
    case "revenue":
      return line("Chiffre d’affaires", m.revenue, when);
    case "expenses":
      return line("Dépenses", m.expenses, when);
    case "invoices":
      return line("Factures à régler", m.unpaidInvoices, "à ce jour");
    case "staff":
      return line("Coût de personnel", m.staffCost, when);
    case "receivables":
      return line("Factures clients à encaisser", m.receivables, "à ce jour");
    case "treasury":
      return [
        line("Trésorerie", m.treasury, "à ce jour"),
        d.bankToReview
          ? `${d.bankToReview} mouvement(s) bancaire(s) restent à rapprocher.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "merchandise":
      return line("Achats de marchandises", m.merchandiseCost, when);
    case "suppliers":
      return [
        line("Coûts fournisseurs", m.supplierCost, when),
        ...d.topSuppliers.map((x) => `• ${x.name} : ${euros(x.total)}`),
      ].join("\n");
    case "vat":
      return line("TVA collectée", m.vatCollected, when);
    case "margin":
      return line("Marge", m.margin, when);
    case "profit":
      return [
        line("Résultat avant personnel", m.resultBeforeStaff, when),
        m.forecastResult.value !== null
          ? line("Résultat prévisionnel", m.forecastResult, when)
          : `Le bénéfice réel reste inconnu : ${m.forecastResult.note.toLowerCase()}`,
      ].join("\n");
    case "marginTrend": {
      const rows = [
        line("Marge", m.margin, when),
        previous && line("Marge", previous.metrics.margin, "le mois dernier"),
        line("Chiffre d’affaires", m.revenue, when),
        previous &&
          line(
            "Chiffre d’affaires",
            previous.metrics.revenue,
            "le mois dernier",
          ),
        line("Coût matière", m.materialCost, when),
        previous &&
          line(
            "Coût matière",
            previous.metrics.materialCost,
            "le mois dernier",
          ),
      ].filter(Boolean);
      return [
        ...rows,
        "Ces chiffres montrent l’évolution, pas sa cause : les mois ne sont pas forcément complets, et les prix d’achat réels ne sont pas encore connus.",
      ].join("\n");
    }
  }
}
/** Bornes du mois précédent, pour comparer la marge. */
export function previousMonth(now = new Date()): PeriodQuery {
  const paris = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(now);
  const first = new Date(`${paris.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(first.getTime() - 86400_000);
  return {
    period: "custom",
    from: `${end.toISOString().slice(0, 7)}-01`,
    to: end.toISOString().slice(0, 10),
  };
}
