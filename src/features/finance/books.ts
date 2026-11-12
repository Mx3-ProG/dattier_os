/* Passage en écriture d’un règlement, dans la transaction du règlement lui-même.
   Ce module sert aussi aux profils de salle : il ne lit donc jamais les écritures,
   réservées à la finance, et écrit uniquement par les fonctions SQL contrôlées. */
import { rows, type DB } from "@/infrastructure/database/db";
import { saleEntryLines, type EntryLine } from "./posting";

type Declaration = {
  id: string;
  session_id: string | null;
  order_id: string | null;
  amount: number;
  discount: number;
  method: "card" | "cash" | "other" | "online";
};
type Item = {
  name: string;
  price: number;
  quantity: number;
  vat_rate_id: string | null;
  vat_rate_bp: number | null;
  sales_account: string | null;
  vat_account: string | null;
};
export type Outcome = "posted" | "review" | "none";

/** Lignes vendues d’un règlement : la commande, ou toutes celles de la table. */
export const declarationItems = (db: DB, p: Declaration) =>
  rows<Item & { id: string }>(
    db,
    `SELECT i.id,i.name,i.price,i.quantity,i.vat_rate_id,i.vat_rate_bp,r.sales_account,r.vat_account
       FROM order_items i JOIN orders o ON o.id=i.order_id
       LEFT JOIN fin_tax_rates r ON r.id=i.vat_rate_id
      WHERE i.status<>'cancelled' AND ${p.session_id ? "o.session_id=$1 AND o.status='paid'" : "o.id=$1"}
      ORDER BY i.name,i.id`,
    [p.session_id ?? p.order_id],
  );

const review = (
  db: DB,
  r: string,
  key: string,
  kind: "vat_undetermined" | "amount_mismatch",
  message: string,
) =>
  db.query("SELECT app.fin_open_review($1,$2,$3,$4)", [r, key, kind, message]);

/** Comptabilise un règlement, ou le signale s’il manque une information. Rejouable. */
export async function processPayment(
  db: DB,
  r: string,
  declarationId: string,
): Promise<Outcome> {
  const [p] = await rows<Declaration>(
    db,
    "SELECT id,session_id,order_id,amount,discount,method FROM payment_declarations WHERE id=$1",
    [declarationId],
  );
  if (!p) throw new Error("Élément introuvable dans cet établissement.");
  if (p.amount === 0) return "none";
  const key = `payment:${p.id}`;
  const items = await declarationItems(db, p);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (!items.length || total - p.discount !== p.amount) {
    await review(
      db,
      r,
      key,
      "amount_mismatch",
      "Le montant encaissé ne correspond pas aux produits vendus et à la remise.",
    );
    return "review";
  }
  const [settings] = await rows<{
    vat_regime: string;
    cash_account: string;
    card_account: string;
    other_account: string;
    online_account: string;
    sales_account: string;
  }>(db, "SELECT * FROM fin_settings WHERE restaurant_id=$1", [r]);
  if (!settings || settings.vat_regime === "unknown") {
    await review(
      db,
      r,
      key,
      "vat_undetermined",
      "Déclarez le régime de TVA de l’établissement pour comptabiliser ce règlement.",
    );
    return "review";
  }
  const account = {
    cash: settings.cash_account,
    card: settings.card_account,
    other: settings.other_account,
    online: settings.online_account,
  }[p.method];
  let lines: EntryLine[];
  if (settings.vat_regime === "franchise") {
    lines = [
      { account, debit: p.amount, credit: 0, label: "Encaissement" },
      {
        account: settings.sales_account,
        debit: 0,
        credit: p.amount,
        label: "Ventes sans TVA",
      },
    ];
  } else {
    const missing = [
      ...new Set(
        items
          .filter(
            (i) => i.vat_rate_bp === null || !i.vat_rate_id || !i.sales_account,
          )
          .map((i) => i.name),
      ),
    ];
    if (missing.length) {
      await review(
        db,
        r,
        key,
        "vat_undetermined",
        `Taux de TVA à préciser : ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}.`,
      );
      return "review";
    }
    lines = saleEntryLines(
      items.map((i) => ({
        gross: i.price * i.quantity,
        rateId: i.vat_rate_id!,
        rateBp: i.vat_rate_bp!,
        salesAccount: i.sales_account!,
        vatAccount: i.vat_account!,
      })),
      p.discount,
      account,
    );
  }
  await db.query("SELECT app.fin_post_entry($1,$2,$3,$4)", [
    r,
    key,
    `Encaissement ${{ card: "carte", cash: "espèces", other: "autre mode", online: "en ligne" }[p.method]}`,
    JSON.stringify(lines),
  ]);
  return "posted";
}
