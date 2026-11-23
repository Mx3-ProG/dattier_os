/* Recherche de correspondances, sans accès à la base : entièrement testable.
   Ne propose que des opérations qui existent déjà. Sans correspondance : rien. */
import { normalize } from "@/domain/shared/text";

export type BankTx = {
  id: string;
  bookedOn: string;
  amount: number;
  label: string;
};
export type OpenInvoice = {
  id: string;
  supplier: string;
  number: string;
  gross: number;
  invoiceDate: string;
  /** Déjà marquée réglée à la main : le mouvement la confirme, sans seconde écriture. */
  alreadyPaid?: boolean;
};
export type OpenCustomerInvoice = {
  id: string;
  customer: string;
  number: string;
  due: number;
  issueDate: string;
};
export type SentPayout = { id: string; amount: number; sentOn: string };
export type CardDay = { day: string; total: number };
export type Candidate = {
  kind:
    | "invoice"
    | "invoice_link"
    | "online_payout"
    | "card_batch"
    | "cash_deposit"
    | "customer_invoice";
  targets: string[];
  label: string;
  difference: number;
  confidence: "high" | "medium";
};
export type Pools = {
  customerInvoices?: OpenCustomerInvoice[];
  invoices: OpenInvoice[];
  payouts: SentPayout[];
  cardDays: CardDay[];
};
const days = (a: string, b: string) =>
  (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400_000;
const shift = (day: string, by: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400_000)
    .toISOString()
    .slice(0, 10);
/** Commission de carte tolérée entre les ventes et la remise reçue. */
export const maxCardFeeRate = 0.06;

const namedIn = (supplier: string, label: string) => {
  const text = normalize(label);
  return normalize(supplier)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4)
    .some((w) => new RegExp(`\\b${w}\\b`).test(text));
};

export function candidatesFor(tx: BankTx, pools: Pools): Candidate[] {
  const found: Candidate[] = [];
  const text = normalize(tx.label);
  if (tx.amount < 0) {
    const matching = pools.invoices.filter((i) => {
      const gap = days(tx.bookedOn, i.invoiceDate);
      return i.gross === -tx.amount && gap >= -5 && gap <= 120;
    });
    for (const i of matching)
      found.push({
        kind: i.alreadyPaid ? "invoice_link" : "invoice",
        targets: [`invoice:${i.id}`],
        label: `Facture ${i.number} · ${i.supplier}${i.alreadyPaid ? " (déjà marquée réglée)" : ""}`,
        difference: 0,
        // Montant identique et fournisseur nommé, sans autre facture possible.
        confidence:
          namedIn(i.supplier, tx.label) &&
          matching.filter((x) => namedIn(x.supplier, tx.label)).length === 1
            ? "high"
            : "medium",
      });
    return found;
  }
  // Facture client : montant exact restant dû. Jamais une nouvelle vente.
  const owed = (pools.customerInvoices ?? []).filter((i) => {
    const gap = days(tx.bookedOn, i.issueDate);
    return i.due === tx.amount && gap >= -5 && gap <= 120;
  });
  for (const i of owed)
    found.push({
      kind: "customer_invoice",
      targets: [`sale-invoice:${i.id}`],
      label: `Facture ${i.number} · ${i.customer}`,
      difference: 0,
      confidence:
        namedIn(i.customer, tx.label) &&
        owed.filter((x) => namedIn(x.customer, tx.label)).length === 1
          ? "high"
          : "medium",
    });
  for (const p of pools.payouts) {
    const gap = days(tx.bookedOn, p.sentOn);
    if (p.amount === tx.amount && gap >= 0 && gap <= 14)
      found.push({
        kind: "online_payout",
        targets: [`payout:${p.id}`],
        label: `Versement des ventes en ligne du ${p.sentOn}`,
        difference: 0,
        confidence: /stripe|dattier|atacuisine/.test(text) ? "high" : "medium",
      });
  }
  // Remise de cartes : une à trois journées de suite, moins la commission éventuelle.
  const byDay = new Map(pools.cardDays.map((d) => [d.day, d.total]));
  const looksLikeCards = /\b(cb|carte|cartes|remise|tpe|monetique)\b/.test(
    text,
  );
  for (let back = 1; back <= 5; back++) {
    for (let length = 1; length <= 3; length++) {
      const span = Array.from({ length }, (_, n) =>
        shift(tx.bookedOn, -back - n),
      );
      if (span.some((d) => !byDay.has(d))) continue;
      const total = span.reduce((s, d) => s + byDay.get(d)!, 0);
      const fee = total - tx.amount;
      if (fee < 0 || fee > total * maxCardFeeRate) continue;
      if (fee !== 0 && !looksLikeCards) continue;
      found.push({
        kind: "card_batch",
        targets: span.map((d) => `card:${d}`),
        label: `Cartes du ${[...span].reverse()[0]}${length > 1 ? ` au ${span[0]}` : ""}`,
        difference: fee,
        confidence: "medium",
      });
    }
  }
  if (
    /\b(versement|depot|remise)\b.*\b(especes?|cash)\b|\b(especes?)\b.*\b(versement|depot)\b/.test(
      text,
    )
  )
    found.push({
      kind: "cash_deposit",
      targets: [],
      label: "Dépôt d’espèces sur le compte",
      difference: 0,
      confidence: "medium",
    });
  return found;
}

/** Signale deux mouvements quasi identiques : même montant et même libellé à trois jours près. */
export function possibleDuplicates(txs: BankTx[]) {
  const flagged = new Set<string>();
  const key = (t: BankTx) => `${t.amount}|${normalize(t.label)}`;
  const groups = new Map<string, BankTx[]>();
  for (const t of txs) groups.set(key(t), [...(groups.get(key(t)) ?? []), t]);
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) =>
      a.bookedOn.localeCompare(b.bookedOn),
    );
    for (let i = 1; i < sorted.length; i++)
      if (days(sorted[i].bookedOn, sorted[i - 1].bookedOn) <= 3) {
        flagged.add(sorted[i].id);
        flagged.add(sorted[i - 1].id);
      }
  }
  return flagged;
}
