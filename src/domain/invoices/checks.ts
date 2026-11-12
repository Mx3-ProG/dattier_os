/* Contrôles déterministes d’une facture. Ils tranchent : l’IA propose, ces règles disposent.
   Un point « blocking » interdit la comptabilisation. Un « warning » demande de vérifier. */
import { normalize } from "@/features/assistant/text";

export const categories = {
  merchandise: { label: "Marchandises", account: "607" },
  energy: { label: "Énergie et eau", account: "6061" },
  supplies: { label: "Petit matériel et fournitures", account: "6063" },
  rent: { label: "Locations", account: "613" },
  maintenance: { label: "Entretien et réparations", account: "615" },
  fees: { label: "Honoraires", account: "6226" },
  other: { label: "Autres charges", account: "628" },
} as const;
export type Category = keyof typeof categories;

export type InvoiceDraft = {
  supplierName: string | null;
  supplierVat: string | null;
  number: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  net: number | null;
  vat: number | null;
  gross: number | null;
  category: Category | null;
};
export const emptyDraft = (): InvoiceDraft => ({
  supplierName: null,
  supplierVat: null,
  number: null,
  invoiceDate: null,
  dueDate: null,
  net: null,
  vat: null,
  gross: null,
  category: null,
});
export type Issue = { level: "blocking" | "warning"; message: string };

const validDate = (value: string | null) =>
  !!value &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** Clé de doublon : même fournisseur et même numéro, quelle que soit l’écriture. */
export function dedupeKey(supplier: string, number: string) {
  const compact = (s: string) => normalize(s).replace(/[^a-z0-9]/g, "");
  return `${compact(supplier)}|${compact(number)}`;
}

export function checkInvoice(
  d: InvoiceDraft,
  today = new Date().toISOString().slice(0, 10),
): Issue[] {
  const issues: Issue[] = [];
  const need = (ok: unknown, what: string) => {
    if (!ok)
      issues.push({ level: "blocking", message: `${what} manquant(e).` });
  };
  need(d.supplierName?.trim(), "Fournisseur");
  need(d.number?.trim(), "Numéro de facture");
  need(d.category, "Catégorie");
  if (!validDate(d.invoiceDate))
    issues.push({
      level: "blocking",
      message: "Date de facture manquante ou invalide.",
    });
  else if (d.invoiceDate! > today)
    issues.push({
      level: "warning",
      message: "La date de facture est dans le futur.",
    });
  if (d.dueDate && !validDate(d.dueDate))
    issues.push({ level: "blocking", message: "Date d’échéance invalide." });
  else if (d.dueDate && d.invoiceDate && d.dueDate < d.invoiceDate)
    issues.push({
      level: "warning",
      message: "L’échéance précède la date de facture.",
    });
  if (d.net === null || d.vat === null || d.gross === null)
    issues.push({
      level: "blocking",
      message: "Montants HT, TVA et TTC requis.",
    });
  else {
    if (d.gross <= 0)
      issues.push({
        level: "blocking",
        message:
          "Montant nul ou négatif : les avoirs ne sont pas encore pris en charge.",
      });
    if (d.net + d.vat !== d.gross)
      issues.push({
        level: "blocking",
        message: `Le total ne correspond pas : HT + TVA = ${((d.net + d.vat) / 100).toFixed(2)} €, TTC = ${(d.gross / 100).toFixed(2)} €.`,
      });
  }
  return issues;
}
