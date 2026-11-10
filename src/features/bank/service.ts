/* Comptes bancaires, import des relevés et rapprochement.
   Un rapprochement proposé doit être recalculé côté serveur pour être accepté : le
   navigateur ne peut pas désigner une opération arbitraire. */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@/lib/auth/session";
import { one, rows, type DB } from "@/lib/database/db";
import { log } from "@/features/orders/service";
import { ensureDefaults } from "@/features/finance/service";
import { financeAccess, invoiceAction } from "@/features/invoices/service";
import { saveDocument } from "@/features/invoices/storage";
import { recordPayment, voidBankPayment } from "@/features/billing/service";
import {
  candidatesFor,
  possibleDuplicates,
  type BankTx,
  type Candidate,
  type Pools,
} from "./matching";
import { parseStatement, withKeys } from "./parsers";

export type Run = <T>(fn: (tx: DB) => Promise<T>) => Promise<T>;
export const maxStatementBytes = 10 * 1024 * 1024;

/** Ce qui peut encore être rapproché : ni déjà pris, ni antérieur de plus de six mois. */
async function pools(db: DB, r: string): Promise<Pools> {
  const invoices = await rows<{
    id: string;
    supplier_name: string;
    invoice_number: string;
    gross: number;
    invoice_date: string;
    status: string;
  }>(
    db,
    `SELECT id,supplier_name,invoice_number,gross,invoice_date::text,status FROM fin_supplier_invoices i
      WHERE restaurant_id=$1 AND (status='validated' OR (status='paid' AND paid_method IN ('bank','card')))
        AND NOT EXISTS(SELECT 1 FROM fin_bank_match_targets t WHERE t.restaurant_id=$1 AND t.target_key='invoice:'||i.id)`,
    [r],
  );
  const payouts = await rows<{ id: string; amount: number; sent_on: string }>(
    db,
    `SELECT id,amount,(sent_at AT TIME ZONE 'Europe/Paris')::date::text AS sent_on FROM online_payouts p
      WHERE restaurant_id=$1 AND status='sent'
        AND NOT EXISTS(SELECT 1 FROM fin_bank_match_targets t WHERE t.restaurant_id=$1 AND t.target_key='payout:'||p.id)`,
    [r],
  );
  const cardDays = await rows<{ day: string; total: number }>(
    db,
    `SELECT day,total FROM (
       SELECT to_char(p.created_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day,sum(p.amount)::int AS total
         FROM payment_declarations p
         LEFT JOIN orders o ON o.id=p.order_id
         LEFT JOIN table_sessions s ON s.id=p.session_id
         LEFT JOIN dining_tables t ON t.id=s.table_id
        WHERE coalesce(o.restaurant_id,t.restaurant_id)=$1 AND p.method='card' AND p.created_at>now()-interval '190 days'
        GROUP BY 1) d
      WHERE NOT EXISTS(SELECT 1 FROM fin_bank_match_targets t WHERE t.restaurant_id=$1 AND t.target_key='card:'||d.day)`,
    [r],
  );
  const customerInvoices = await rows<{
    id: string;
    customer_name: string;
    number: string;
    due: number;
    issue_date: string;
  }>(
    db,
    `SELECT i.id,i.customer_name,i.number,i.issue_date::text,
            i.gross-coalesce((SELECT sum(p.amount) FROM fin_invoice_payments p WHERE p.invoice_id=i.id AND p.voided_at IS NULL),0)
                   -coalesce((SELECT sum(c.applied) FROM fin_invoices c WHERE c.credits_invoice_id=i.id AND c.status IN ('issued','paid')),0) AS due
       FROM fin_invoices i
      WHERE i.restaurant_id=$1 AND i.kind='invoice' AND i.status='issued'
        AND NOT EXISTS(SELECT 1 FROM fin_bank_match_targets t WHERE t.restaurant_id=$1 AND t.target_key='sale-invoice:'||i.id)`,
    [r],
  );
  return {
    customerInvoices: customerInvoices.map((i) => ({
      id: i.id,
      customer: i.customer_name,
      number: i.number,
      due: Number(i.due),
      issueDate: i.issue_date,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      supplier: i.supplier_name,
      number: i.invoice_number,
      gross: i.gross,
      invoiceDate: i.invoice_date,
      alreadyPaid: i.status === "paid",
    })),
    payouts: payouts.map((p) => ({
      id: p.id,
      amount: p.amount,
      sentOn: p.sent_on,
    })),
    cardDays,
  };
}

type TxRow = {
  id: string;
  account_id: string;
  booked_on: string;
  amount: number;
  label: string;
  status: string;
  note: string | null;
};
const toTx = (t: TxRow): BankTx => ({
  id: t.id,
  bookedOn: t.booked_on,
  amount: t.amount,
  label: t.label,
});
const txColumns = "id,account_id,booked_on::text,amount,label,status,note";

/** Applique un rapprochement déjà recalculé : cible, statut et écriture dans la même transaction. */
async function applyMatch(
  db: DB,
  r: string,
  user: Actor,
  t: TxRow,
  c: Candidate,
  automatic: boolean,
) {
  const matchId = randomUUID();
  await db.query(
    "INSERT INTO fin_bank_matches(id,restaurant_id,transaction_id,kind,label,difference,automatic,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      matchId,
      r,
      t.id,
      c.kind,
      c.label.slice(0, 200),
      c.difference,
      automatic,
      user.id,
    ],
  );
  for (const target of c.targets)
    await db.query(
      "INSERT INTO fin_bank_match_targets(restaurant_id,target_key,match_id) VALUES($1,$2,$3)",
      [r, target, matchId],
    );
  await db.query(
    "UPDATE fin_bank_transactions SET status='matched',note=NULL WHERE id=$1",
    [t.id],
  );
  if (c.kind === "invoice") {
    // Le règlement de la facture passe par son parcours normal, sans ressaisie.
    await invoiceAction(db, r, user, {
      action: "pay",
      id: c.targets[0].slice("invoice:".length),
      paidOn: t.booked_on,
      method: "bank",
    });
  } else if (c.kind === "customer_invoice") {
    await recordPayment(
      db,
      r,
      user.id,
      c.targets[0].slice("sale-invoice:".length),
      t.amount,
      t.booked_on,
      "bank",
      t.id,
    );
  } else if (c.kind !== "invoice_link") {
    const lines =
      c.kind === "online_payout"
        ? [
            { account: "512", debit: t.amount, credit: 0, label: "Banque" },
            {
              account: "580",
              debit: 0,
              credit: t.amount,
              label: "Virement reçu",
            },
          ]
        : c.kind === "cash_deposit"
          ? [
              { account: "512", debit: t.amount, credit: 0, label: "Banque" },
              { account: "530", debit: 0, credit: t.amount, label: "Caisse" },
            ]
          : [
              { account: "512", debit: t.amount, credit: 0, label: "Banque" },
              {
                account: "627",
                debit: c.difference,
                credit: 0,
                label: "Commission de carte",
              },
              {
                account: "5115",
                debit: 0,
                credit: t.amount + c.difference,
                label: "Cartes à encaisser",
              },
            ].filter((l) => l.debit + l.credit > 0);
    await db.query(
      "SELECT app.fin_post_invoice($1,$2,'bank.matched',$3,$4,'bank_match',$5,$6::date,$7,'BQ')",
      [
        r,
        `bank-match:${matchId}`,
        matchId,
        t.amount,
        c.label.slice(0, 200),
        t.booked_on,
        JSON.stringify(lines),
      ],
    );
  }
  await log(
    db,
    r,
    user.id,
    `Mouvement rapproché : ${c.label}`.slice(0, 200),
    t.id,
  );
  return matchId;
}

export type ImportResult = {
  added: number;
  skipped: number;
  matched: number;
  duplicateFile: boolean;
  balanceWarning: string | null;
  format: string;
};
export async function importStatement(
  run: Run,
  r: string,
  rawUser: Actor,
  accountId: string,
  data: Buffer,
  filename: string,
): Promise<ImportResult> {
  if (!data.length || data.length > maxStatementBytes)
    throw new Error("Relevé vide ou trop volumineux (10 Mo au maximum).");
  const statement = parseStatement(data);
  const sha = createHash("sha256").update(data).digest("hex");
  const prior = await run(async (tx) => {
    await financeAccess(tx, r, rawUser);
    await ensureDefaults(tx, r);
    await one(
      tx,
      "SELECT id FROM fin_bank_accounts WHERE id=$1 AND restaurant_id=$2",
      [accountId, r],
    );
    return rows(
      tx,
      "SELECT id FROM fin_bank_imports WHERE restaurant_id=$1 AND account_id=$2 AND sha256=$3",
      [r, accountId, sha],
    );
  });
  const empty = {
    added: 0,
    skipped: statement.movements.length,
    matched: 0,
    balanceWarning: null,
    format: statement.format,
  };
  if (prior.length) return { ...empty, duplicateFile: true };
  const importId = randomUUID(),
    key = `${r}/bank/${importId}`;
  await saveDocument(key, data, "application/octet-stream");
  return run(async (tx) => {
    const user = await financeAccess(tx, r, rawUser);
    const movements = withKeys(statement.movements);
    const known = new Set(
      (
        await rows<{ dedupe_key: string }>(
          tx,
          "SELECT dedupe_key FROM fin_bank_transactions WHERE restaurant_id=$1 AND account_id=$2 AND dedupe_key=ANY($3::text[])",
          [r, accountId, movements.map((m) => m.key)],
        )
      ).map((row) => row.dedupe_key),
    );
    const fresh = movements.filter((m) => !known.has(m.key));
    // L’import porte ses totaux dès sa création : la table est en ajout seul.
    await tx.query(
      "INSERT INTO fin_bank_imports(id,restaurant_id,account_id,object_key,sha256,filename,format,added,skipped,statement_balance,balance_date,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12)",
      [
        importId,
        r,
        accountId,
        key,
        sha,
        filename.replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 120) ||
          "releve",
        statement.format,
        fresh.length,
        movements.length - fresh.length,
        statement.balance,
        statement.balanceDate,
        user.id,
      ],
    );
    for (const m of fresh)
      await tx.query(
        "INSERT INTO fin_bank_transactions(id,restaurant_id,account_id,import_id,booked_on,amount,label,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          randomUUID(),
          r,
          accountId,
          importId,
          m.bookedOn,
          m.amount,
          m.label.slice(0, 500),
          m.key,
        ],
      );
    if (statement.ibanEnd && /^[A-Z0-9]{4}$/.test(statement.ibanEnd))
      await tx.query(
        "UPDATE fin_bank_accounts SET iban_end=coalesce(iban_end,$2) WHERE id=$1",
        [accountId, statement.ibanEnd],
      );
    const balanceWarning = await checkBalance(
      tx,
      r,
      accountId,
      statement.balance,
      statement.balanceDate,
    );
    const matched = await autoMatch(tx, r, user, accountId);
    await log(
      tx,
      r,
      user.id,
      `Relevé importé : ${fresh.length} mouvement(s)`,
      importId,
    );
    return {
      added: fresh.length,
      skipped: movements.length - fresh.length,
      matched,
      duplicateFile: false,
      balanceWarning,
      format: statement.format,
    };
  });
}

/** Le solde annoncé par la banque colle-t-il aux mouvements connus et au solde de départ ? */
async function checkBalance(
  db: DB,
  r: string,
  accountId: string,
  balance: number | null,
  balanceDate: string | null,
) {
  if (balance === null || !balanceDate) return null;
  const account = await one<{
    opening_balance: number | null;
    opening_date: string | null;
  }>(
    db,
    "SELECT opening_balance,opening_date::text FROM fin_bank_accounts WHERE id=$1",
    [accountId],
  );
  if (account.opening_balance === null) return null;
  const { total } = await one<{ total: number }>(
    db,
    "SELECT coalesce(sum(amount),0)::int AS total FROM fin_bank_transactions WHERE account_id=$1 AND booked_on>$2::date AND booked_on<=$3::date",
    [accountId, account.opening_date, balanceDate],
  );
  const computed = account.opening_balance + total;
  return computed === balance
    ? null
    : `Le solde du relevé (${(balance / 100).toFixed(2)} €) diffère du solde calculé (${(computed / 100).toFixed(2)} €) : un mouvement manque peut-être.`;
}

/** Rapprochement automatique, seulement si l’établissement l’a activé et si c’est sans ambiguïté. */
async function autoMatch(db: DB, r: string, user: Actor, accountId: string) {
  const { bank_auto_match: enabled } = await one<{ bank_auto_match: boolean }>(
    db,
    "SELECT bank_auto_match FROM fin_settings WHERE restaurant_id=$1",
    [r],
  );
  if (!enabled) return 0;
  const open = await rows<TxRow>(
    db,
    `SELECT ${txColumns} FROM fin_bank_transactions WHERE restaurant_id=$1 AND account_id=$2 AND status='to_review' ORDER BY booked_on LIMIT 500`,
    [r, accountId],
  );
  let matched = 0;
  for (const t of open) {
    const found = candidatesFor(toTx(t), await pools(db, r));
    if (found.length === 1 && found[0].confidence === "high") {
      await applyMatch(db, r, user, t, found[0], true);
      matched += 1;
    }
  }
  return matched;
}

/** Trésorerie bancaire : dernier solde connu de chaque compte, plus les mouvements suivants. */
export async function bankTreasury(db: DB, r: string) {
  const accounts = await rows<{
    id: string;
    label: string;
    opening_balance: number | null;
    opening_date: string | null;
    statement_balance: number | null;
    balance_date: string | null;
    last_move: string | null;
  }>(
    db,
    `SELECT a.id,a.label,a.opening_balance,a.opening_date::text,s.statement_balance,s.balance_date::text,
            (SELECT max(booked_on)::text FROM fin_bank_transactions t WHERE t.account_id=a.id) AS last_move
       FROM fin_bank_accounts a
       LEFT JOIN LATERAL (SELECT statement_balance,balance_date FROM fin_bank_imports i
                           WHERE i.account_id=a.id AND i.statement_balance IS NOT NULL
                           ORDER BY i.balance_date DESC,i.created_at DESC LIMIT 1) s ON true
      WHERE a.restaurant_id=$1 ORDER BY a.created_at`,
    [r],
  );
  const result = [];
  for (const a of accounts) {
    const base = a.statement_balance ?? a.opening_balance;
    const from = a.statement_balance !== null ? a.balance_date : a.opening_date;
    if (base === null) {
      result.push({
        id: a.id,
        label: a.label,
        balance: null,
        asOf: a.last_move,
      });
      continue;
    }
    const { total } = await one<{ total: number }>(
      db,
      "SELECT coalesce(sum(amount),0)::int AS total FROM fin_bank_transactions WHERE account_id=$1 AND booked_on>$2::date",
      [a.id, from],
    );
    result.push({
      id: a.id,
      label: a.label,
      balance: base + total,
      asOf: a.last_move && a.last_move > from! ? a.last_move : from,
    });
  }
  return result;
}

export async function bankState(db: DB, r: string, user: Actor) {
  await financeAccess(db, r, user);
  await ensureDefaults(db, r);
  const settings = await one<{ bank_auto_match: boolean }>(
    db,
    "SELECT bank_auto_match FROM fin_settings WHERE restaurant_id=$1",
    [r],
  );
  const open = await rows<TxRow>(
    db,
    `SELECT ${txColumns} FROM fin_bank_transactions WHERE restaurant_id=$1 AND status='to_review' ORDER BY booked_on DESC LIMIT 100`,
    [r],
  );
  const recent = await rows<
    TxRow & {
      match_id: string | null;
      match_label: string | null;
      difference: number | null;
    }
  >(
    db,
    `SELECT t.id,t.account_id,t.booked_on::text,t.amount,t.label,t.status,t.note,m.id AS match_id,m.label AS match_label,m.difference
       FROM fin_bank_transactions t
       LEFT JOIN fin_bank_matches m ON m.transaction_id=t.id AND m.undone_at IS NULL
      WHERE t.restaurant_id=$1 AND t.status<>'to_review' ORDER BY t.booked_on DESC LIMIT 50`,
    [r],
  );
  const all = await rows<TxRow>(
    db,
    `SELECT ${txColumns} FROM fin_bank_transactions WHERE restaurant_id=$1 AND booked_on>now()-interval '190 days'`,
    [r],
  );
  const duplicates = possibleDuplicates(all.map(toTx));
  const available = await pools(db, r);
  const { count } = await one<{ count: number }>(
    db,
    "SELECT count(*)::int AS count FROM fin_bank_transactions WHERE restaurant_id=$1 AND status='to_review'",
    [r],
  );
  return {
    autoMatch: settings.bank_auto_match,
    accounts: await bankTreasury(db, r),
    toReview: count,
    open: open.map((t) => ({
      ...t,
      duplicate: duplicates.has(t.id),
      candidates: candidatesFor(toTx(t), available),
    })),
    recent,
  };
}

const id = z.string().min(1).max(100);
export const bankActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("account"),
    label: z.string().trim().min(1).max(80),
    openingBalance: z
      .number()
      .int()
      .min(-1_000_000_000)
      .max(1_000_000_000)
      .nullable(),
    openingDate: z.iso.date().nullable(),
  }),
  z.object({
    action: z.literal("match"),
    id,
    kind: z.enum([
      "invoice",
      "invoice_link",
      "customer_invoice",
      "online_payout",
      "card_batch",
      "cash_deposit",
    ]),
    targets: z.array(z.string().max(120)).max(5),
  }),
  z.object({
    action: z.literal("ignore"),
    id,
    note: z.string().trim().min(5).max(200),
  }),
  z.object({ action: z.literal("restore"), id }),
  z.object({
    action: z.literal("undo"),
    id,
    reason: z.string().trim().min(10).max(150),
  }),
  z.object({ action: z.literal("autoMatch"), enabled: z.boolean() }),
]);

const lockTx = (db: DB, r: string, tx: string) =>
  one<TxRow>(
    db,
    `SELECT ${txColumns} FROM fin_bank_transactions WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
    [tx, r],
  );

export async function bankAction(
  db: DB,
  r: string,
  rawUser: Actor,
  a: z.infer<typeof bankActionSchema>,
) {
  const user = await financeAccess(db, r, rawUser);
  await ensureDefaults(db, r);
  switch (a.action) {
    case "account": {
      if ((a.openingBalance === null) !== (a.openingDate === null))
        throw new Error("Indiquez à la fois le solde de départ et sa date.");
      const account = randomUUID();
      await db.query(
        "INSERT INTO fin_bank_accounts(id,restaurant_id,label,opening_balance,opening_date) VALUES($1,$2,$3,$4,$5)",
        [account, r, a.label, a.openingBalance, a.openingDate],
      );
      await log(db, r, user.id, "Compte bancaire ajouté", account);
      return { id: account };
    }
    case "match": {
      const t = await lockTx(db, r, a.id);
      if (t.status !== "to_review")
        throw new Error("Ce mouvement a déjà été traité.");
      const wanted = [...a.targets].sort().join("|");
      const candidate = candidatesFor(toTx(t), await pools(db, r)).find(
        (c) => c.kind === a.kind && [...c.targets].sort().join("|") === wanted,
      );
      if (!candidate)
        throw new Error("Cette correspondance n’est plus disponible.");
      return { match: await applyMatch(db, r, user, t, candidate, false) };
    }
    case "ignore": {
      const t = await lockTx(db, r, a.id);
      if (t.status !== "to_review")
        throw new Error("Ce mouvement a déjà été traité.");
      await db.query(
        "UPDATE fin_bank_transactions SET status='ignored',note=$2 WHERE id=$1",
        [a.id, a.note],
      );
      await log(
        db,
        r,
        user.id,
        "Mouvement bancaire écarté du rapprochement",
        a.id,
      );
      return {};
    }
    case "restore": {
      const t = await lockTx(db, r, a.id);
      if (t.status !== "ignored")
        throw new Error("Seul un mouvement écarté peut être repris.");
      await db.query(
        "UPDATE fin_bank_transactions SET status='to_review',note=NULL WHERE id=$1",
        [a.id],
      );
      return {};
    }
    case "undo": {
      const t = await lockTx(db, r, a.id);
      const match = (
        await rows<{ id: string; kind: string }>(
          db,
          "SELECT id,kind FROM fin_bank_matches WHERE transaction_id=$1 AND undone_at IS NULL",
          [a.id],
        )
      )[0];
      if (t.status !== "matched" || !match)
        throw new Error("Ce mouvement n’est pas rapproché.");
      const targets = await rows<{ target_key: string }>(
        db,
        "SELECT target_key FROM fin_bank_match_targets WHERE match_id=$1",
        [match.id],
      );
      if (match.kind === "invoice") {
        const invoice = targets[0].target_key.slice("invoice:".length);
        await db.query("SELECT app.fin_reverse_event($1,$2,$3)", [
          r,
          `invoice-paid:${invoice}`,
          a.reason,
        ]);
        await db.query(
          "UPDATE fin_supplier_invoices SET status='validated',paid_on=NULL,paid_method=NULL WHERE id=$1 AND status='paid'",
          [invoice],
        );
      } else if (match.kind === "customer_invoice") {
        await voidBankPayment(db, r, a.id, a.reason);
      } else if (match.kind !== "invoice_link")
        await db.query("SELECT app.fin_reverse_event($1,$2,$3)", [
          r,
          `bank-match:${match.id}`,
          a.reason,
        ]);
      await db.query("DELETE FROM fin_bank_match_targets WHERE match_id=$1", [
        match.id,
      ]);
      await db.query(
        "UPDATE fin_bank_matches SET undone_at=now(),undone_by=$2 WHERE id=$1",
        [match.id, user.id],
      );
      await db.query(
        "UPDATE fin_bank_transactions SET status='to_review' WHERE id=$1",
        [a.id],
      );
      await log(db, r, user.id, "Rapprochement annulé", a.id);
      return {};
    }
    case "autoMatch":
      await db.query(
        "UPDATE fin_settings SET bank_auto_match=$2,updated_by=$3,updated_at=now() WHERE restaurant_id=$1",
        [r, a.enabled, user.id],
      );
      await log(
        db,
        r,
        user.id,
        `Rapprochement automatique : ${a.enabled ? "activé" : "désactivé"}`,
      );
      return {};
  }
}
