/* Calcul pur des écritures de vente : aucun accès à la base, entièrement testable.
   Les prix sont TTC, en centimes. Aucun taux n’est supposé ici : sans taux, pas d’écriture. */

export type SaleLine = {
  gross: number;
  rateId: string;
  rateBp: number;
  salesAccount: string;
  vatAccount: string;
};
export type EntryLine = {
  account: string;
  debit: number;
  credit: number;
  label: string;
};

/** Répartit un montant au prorata, sans perdre un centime (plus forts restes). */
export function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const shares = weights.map((w, index) => {
    const exact = (total * w) / sum;
    return { index, share: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = total - shares.reduce((s, x) => s + x.share, 0);
  for (const x of [...shares].sort(
    (a, b) => b.rest - a.rest || a.index - b.index,
  )) {
    if (left <= 0) break;
    x.share += 1;
    left -= 1;
  }
  return shares.map((x) => x.share);
}

/** Part hors taxes et TVA d’un montant TTC. Leur somme vaut toujours le TTC. */
export function splitVat(gross: number, rateBp: number) {
  const net = Math.round((gross * 10000) / (10000 + rateBp));
  return { net, vat: gross - net };
}

/** Écriture de vente encaissée, TVA ventilée par taux, remise répartie au prorata. */
export function saleEntryLines(
  lines: SaleLine[],
  discount: number,
  paymentAccount: string,
): EntryLine[] {
  const buckets = new Map<string, SaleLine>();
  for (const line of lines) {
    const known = buckets.get(line.rateId);
    if (known) known.gross += line.gross;
    else buckets.set(line.rateId, { ...line });
  }
  const list = [...buckets.values()].sort((a, b) =>
    a.rateId < b.rateId ? -1 : 1,
  );
  const discounts = allocate(
    discount,
    list.map((b) => b.gross),
  );
  const credits: EntryLine[] = [];
  let received = 0;
  list.forEach((bucket, n) => {
    const gross = bucket.gross - discounts[n];
    if (gross <= 0) return;
    received += gross;
    const { net, vat } = splitVat(gross, bucket.rateBp);
    const rate = (bucket.rateBp / 100).toLocaleString("fr-FR");
    credits.push({
      account: bucket.salesAccount,
      debit: 0,
      credit: net,
      label: `Ventes ${rate} %`,
    });
    if (vat > 0)
      credits.push({
        account: bucket.vatAccount,
        debit: 0,
        credit: vat,
        label: `TVA collectée ${rate} %`,
      });
  });
  return [
    {
      account: paymentAccount,
      debit: received,
      credit: 0,
      label: "Encaissement",
    },
    ...credits,
  ];
}
