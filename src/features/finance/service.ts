/* Centre de pré-comptabilité : configuration de la TVA, opérations à vérifier, journal.
   Réservé à la permission « finance » ; les politiques RLS appliquent la même règle. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { requireCommercialCapability } from "@/features/platform/entitlements";
import { log } from "@/features/orders/service";
import { declarationItems, processPayment } from "./books";

const defaultAccounts: [string, string][] = [
  ["530", "Caisse"],
  ["5115", "Cartes bancaires à encaisser"],
  ["5118", "Autres valeurs à encaisser"],
  ["707", "Ventes"],
  ["70755", "Ventes TVA 5,5 %"],
  ["70710", "Ventes TVA 10 %"],
  ["70720", "Ventes TVA 20 %"],
  ["445713", "TVA collectée 5,5 %"],
  ["445711", "TVA collectée 10 %"],
  ["445712", "TVA collectée 20 %"],
  ["4671", "Ventes en ligne à recevoir de la plateforme"],
  ["580", "Virements en cours"],
  ["6222", "Commissions de la plateforme"],
  ["627", "Services bancaires"],
  ["401", "Fournisseurs"],
  ["411", "Clients"],
  ["44566", "TVA déductible"],
  ["512", "Banque"],
  ["607", "Achats de marchandises"],
  ["6061", "Énergie et eau"],
  ["6063", "Petit matériel et fournitures"],
  ["613", "Locations"],
  ["615", "Entretien et réparations"],
  ["6226", "Honoraires"],
  ["628", "Autres charges externes"],
];
const defaultRates: [string, number, string, string][] = [
  ["5,5 %", 550, "70755", "445713"],
  ["10 %", 1000, "70710", "445711"],
  ["20 %", 2000, "70720", "445712"],
];
/** Limite d’un passage : le reste suit au chargement suivant. */
const batch = 300;

async function access(db: DB, r: string, user: Actor) {
  const scoped = await scope(db, user, r);
  requirePermission(scoped.roles ?? scoped.role, "finance");
  await requireCommercialCapability(db, r, "finance");
  return scoped;
}

/** Propose le plan comptable et les taux légaux. N’affecte aucun taux à aucun produit. */
export async function ensureDefaults(db: DB, r: string) {
  const known = await rows(
    db,
    "SELECT restaurant_id FROM fin_settings WHERE restaurant_id=$1",
    [r],
  );
  if (known.length) return;
  for (const [code, label] of defaultAccounts)
    await db.query(
      "INSERT INTO fin_accounts(restaurant_id,code,label) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [r, code, label],
    );
  for (const [label, bp, sales, vat] of defaultRates)
    await db.query(
      "INSERT INTO fin_tax_rates(id,restaurant_id,label,rate_bp,sales_account,vat_account) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [randomUUID(), r, label, bp, sales, vat],
    );
  await db.query(
    "INSERT INTO fin_settings(restaurant_id) VALUES($1) ON CONFLICT DO NOTHING",
    [r],
  );
}

/** Traite les règlements arrivés sans écriture ni signalement (reprise, import, démo). */
async function syncPending(db: DB, r: string) {
  const pending = await rows<{ source_id: string }>(
    db,
    `SELECT e.source_id FROM fin_events e
      WHERE e.restaurant_id=$1 AND e.amount>0 AND e.type='payment.confirmed'
        AND NOT EXISTS(SELECT 1 FROM fin_entries x WHERE x.event_id=e.id)
        AND NOT EXISTS(SELECT 1 FROM fin_review_items v WHERE v.event_id=e.id)
      ORDER BY e.occurred_at LIMIT ${batch}`,
    [r],
  );
  for (const p of pending) await processPayment(db, r, p.source_id);
}

const closeReview = (db: DB, id: string, user: Actor, note: string) =>
  db.query(
    "UPDATE fin_review_items SET status='resolved',note=$3,resolved_by=$2,resolved_at=now() WHERE id=$1 AND status='open'",
    [id, user.id, note],
  );

/** Reprend les opérations en attente après une décision de l’utilisateur. */
async function retryOpen(
  db: DB,
  r: string,
  user: Actor,
  applyConfigured: boolean,
) {
  const open = await rows<{ id: string; source_id: string }>(
    db,
    `SELECT v.id,e.source_id FROM fin_review_items v JOIN fin_events e ON e.id=v.event_id
      WHERE v.restaurant_id=$1 AND v.status='open' AND v.kind='vat_undetermined'
      ORDER BY v.created_at LIMIT ${batch}`,
    [r],
  );
  let posted = 0;
  for (const item of open) {
    if (applyConfigured) {
      const orders = await rows<{ id: string }>(
        db,
        `SELECT o.id FROM payment_declarations p JOIN orders o ON o.id=p.order_id OR (p.session_id IS NOT NULL AND o.session_id=p.session_id) WHERE p.id=$1`,
        [item.source_id],
      );
      for (const o of orders)
        await db.query("SELECT app.fin_freeze_order_vat($1)", [o.id]);
    }
    if ((await processPayment(db, r, item.source_id)) === "posted") {
      await closeReview(db, item.id, user, "Comptabilisée après configuration");
      posted += 1;
    }
  }
  return posted;
}

export async function financeState(db: DB, r: string, user: Actor) {
  await access(db, r, user);
  await ensureDefaults(db, r);
  await syncPending(db, r);
  // Une transaction n’exécute qu’une requête à la fois sur sa connexion.
  const settings = await one<Record<string, string>>(
    db,
    "SELECT vat_regime,cash_account,card_account,other_account,sales_account FROM fin_settings WHERE restaurant_id=$1",
    [r],
  );
  const accounts = await rows(
    db,
    "SELECT code,label FROM fin_accounts WHERE restaurant_id=$1 ORDER BY code",
    [r],
  );
  const rates = await rows(
    db,
    "SELECT id,label,rate_bp,sales_account,vat_account FROM fin_tax_rates WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY rate_bp,label",
    [r],
  );
  const products = await rows(
    db,
    `SELECT m.id,m.name,m.category,p.onsite_rate_id,p.takeaway_rate_id FROM menu_items m
           LEFT JOIN fin_product_vat p ON p.menu_id=m.id AND p.restaurant_id=m.restaurant_id
          WHERE m.restaurant_id=$1 AND m.archived_at IS NULL ORDER BY m.category,m.name`,
    [r],
  );
  const categories = await rows(
    db,
    `SELECT c.category,v.onsite_rate_id,v.takeaway_rate_id,c.products FROM
       (SELECT category,count(*)::int AS products FROM menu_items WHERE restaurant_id=$1 AND archived_at IS NULL GROUP BY category) c
       LEFT JOIN fin_category_vat v ON v.restaurant_id=$1 AND v.category=c.category
      ORDER BY c.category`,
    [r],
  );
  // Calcul d’aide à la déclaration : le restaurateur reste responsable de sa TVA.
  const vatSummary = await rows(
    db,
    `SELECT to_char(n.entry_date,'YYYY-MM') AS month,r.label,r.rate_bp,
            coalesce(sum(l.credit-l.debit) FILTER (WHERE l.account_code=r.sales_account),0)::bigint AS net,
            coalesce(sum(l.credit-l.debit) FILTER (WHERE l.account_code=r.vat_account),0)::bigint AS vat
       FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id
       JOIN fin_tax_rates r ON r.restaurant_id=l.restaurant_id AND l.account_code IN (r.sales_account,r.vat_account)
      WHERE l.restaurant_id=$1 AND n.kind IN ('sale_payment','sale_invoice','sale_credit','reversal')
      GROUP BY 1,r.label,r.rate_bp ORDER BY 1 DESC,r.rate_bp LIMIT 60`,
    [r],
  );
  const counts = await one<{
    events: number;
    entries: number;
    open: number;
    invoices: number;
    bank: number;
  }>(
    db,
    `SELECT (SELECT count(*)::int FROM fin_events WHERE restaurant_id=$1) AS events,
                (SELECT count(*)::int FROM fin_supplier_invoices WHERE restaurant_id=$1 AND status='to_review') AS invoices,
                (SELECT count(*)::int FROM fin_bank_transactions WHERE restaurant_id=$1 AND status='to_review') AS bank,
                (SELECT count(*)::int FROM fin_entries WHERE restaurant_id=$1) AS entries,
                (SELECT count(*)::int FROM fin_review_items WHERE restaurant_id=$1 AND status='open') AS open`,
    [r],
  );
  const open = await rows<{
    id: string;
    kind: string;
    message: string;
    source_id: string;
    amount: number;
    occurred_at: string;
  }>(
    db,
    `SELECT v.id,v.kind,v.message,e.source_id,e.amount,e.occurred_at
           FROM fin_review_items v JOIN fin_events e ON e.id=v.event_id
          WHERE v.restaurant_id=$1 AND v.status='open' ORDER BY e.occurred_at DESC LIMIT 50`,
    [r],
  );
  const entries = await rows<{
    id: string;
    number: number;
    entry_date: string;
    label: string;
    kind: string;
    reversed: boolean;
  }>(
    db,
    `SELECT e.id,e.number,e.entry_date::text,e.label,e.kind,
                EXISTS(SELECT 1 FROM fin_entries x WHERE x.reverses_entry_id=e.id) AS reversed
           FROM fin_entries e WHERE e.restaurant_id=$1 ORDER BY e.number DESC LIMIT 30`,
    [r],
  );
  const lines = entries.length
    ? await rows<{ entry_id: string }>(
        db,
        "SELECT entry_id,line_no,account_code,debit,credit,label FROM fin_entry_lines WHERE entry_id=ANY($1::text[]) ORDER BY line_no",
        [entries.map((e) => e.id)],
      )
    : [];
  const review = [];
  for (const item of open) {
    const [p] = await rows<Parameters<typeof declarationItems>[1]>(
      db,
      "SELECT id,session_id,order_id,amount,discount,method FROM payment_declarations WHERE id=$1",
      [item.source_id],
    );
    review.push({
      ...item,
      method: p.method,
      discount: p.discount,
      items: await declarationItems(db, p),
    });
  }
  return {
    settings,
    accounts,
    rates,
    products,
    categories,
    vatSummary,
    counts,
    review,
    entries: entries.map((e) => ({
      ...e,
      lines: lines.filter((l) => l.entry_id === e.id),
    })),
  };
}

const id = z.string().min(1).max(100);
const account = z
  .string()
  .regex(/^[1-8][0-9]{1,9}$/, "Numéro de compte invalide.");
export const financeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("settings"),
    vatRegime: z.enum(["unknown", "normal", "franchise"]),
    cashAccount: account,
    cardAccount: account,
    otherAccount: account,
    salesAccount: account,
  }),
  z.object({
    action: z.literal("account"),
    code: account,
    label: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("rate"),
    label: z.string().trim().min(1).max(80),
    ratePercent: z.coerce.number().min(0).max(100),
    salesAccount: account,
    vatAccount: account,
  }),
  z.object({ action: z.literal("archiveRate"), id }),
  z.object({
    action: z.literal("productVat"),
    menu: id,
    onsite: id.nullable(),
    takeaway: id.nullable(),
  }),
  z.object({
    action: z.literal("categoryVat"),
    category: z.string().trim().min(1).max(100),
    onsite: id.nullable(),
    takeaway: id.nullable(),
  }),
  z.object({ action: z.literal("applyConfigured") }),
  z.object({
    action: z.literal("resolve"),
    id,
    assignments: z
      .array(z.object({ item: id, rate: id }))
      .min(1)
      .max(200),
  }),
  z.object({
    action: z.literal("dismiss"),
    id,
    note: z.string().trim().min(10).max(300),
  }),
  z.object({
    action: z.literal("reverse"),
    id,
    reason: z.string().trim().min(10).max(150),
  }),
  z.object({ action: z.literal("verify") }),
]);

const knownAccount = (db: DB, r: string, code: string) =>
  one(db, "SELECT code FROM fin_accounts WHERE restaurant_id=$1 AND code=$2", [
    r,
    code,
  ]).catch(() => {
    throw new Error(`Compte ${code} inconnu : créez-le d’abord.`);
  });
const activeRate = (db: DB, r: string, rate: string) =>
  one<{ id: string; rate_bp: number }>(
    db,
    "SELECT id,rate_bp FROM fin_tax_rates WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL",
    [rate, r],
  );

export async function financeAction(
  db: DB,
  r: string,
  rawUser: Actor,
  a: z.infer<typeof financeActionSchema>,
) {
  const user = await access(db, r, rawUser);
  await ensureDefaults(db, r);
  switch (a.action) {
    case "settings": {
      for (const code of [
        a.cashAccount,
        a.cardAccount,
        a.otherAccount,
        a.salesAccount,
      ])
        await knownAccount(db, r, code);
      await db.query(
        "UPDATE fin_settings SET vat_regime=$2,cash_account=$3,card_account=$4,other_account=$5,sales_account=$6,updated_by=$7,updated_at=now() WHERE restaurant_id=$1",
        [
          r,
          a.vatRegime,
          a.cashAccount,
          a.cardAccount,
          a.otherAccount,
          a.salesAccount,
          user.id,
        ],
      );
      await log(db, r, user.id, `Régime de TVA déclaré : ${a.vatRegime}`);
      // Ventes passées : seuls les taux figés à la vente partent ici. Une franchise ne
      // s’applique pas d’office au passé, le régime a pu changer : voir applyConfigured.
      return {
        posted:
          a.vatRegime === "normal" ? await retryOpen(db, r, user, false) : 0,
      };
    }
    case "account":
      await db.query(
        "INSERT INTO fin_accounts(restaurant_id,code,label) VALUES($1,$2,$3) ON CONFLICT(restaurant_id,code) DO UPDATE SET label=excluded.label",
        [r, a.code, a.label],
      );
      await log(db, r, user.id, "Compte comptable enregistré", a.code);
      return {};
    case "rate": {
      await knownAccount(db, r, a.salesAccount);
      await knownAccount(db, r, a.vatAccount);
      const rid = randomUUID();
      await db.query(
        "INSERT INTO fin_tax_rates(id,restaurant_id,label,rate_bp,sales_account,vat_account) VALUES($1,$2,$3,$4,$5,$6)",
        [
          rid,
          r,
          a.label,
          Math.round(a.ratePercent * 100),
          a.salesAccount,
          a.vatAccount,
        ],
      );
      await log(db, r, user.id, "Taux de TVA créé", rid);
      return {};
    }
    case "archiveRate":
      await activeRate(db, r, a.id);
      await db.query(
        "UPDATE fin_tax_rates SET archived_at=now() WHERE id=$1 AND restaurant_id=$2",
        [a.id, r],
      );
      await log(db, r, user.id, "Taux de TVA archivé", a.id);
      return {};
    case "productVat": {
      await one(
        db,
        "SELECT id FROM menu_items WHERE id=$1 AND restaurant_id=$2",
        [a.menu, r],
      );
      for (const rate of [a.onsite, a.takeaway])
        if (rate) await activeRate(db, r, rate);
      await db.query(
        "INSERT INTO fin_product_vat(restaurant_id,menu_id,onsite_rate_id,takeaway_rate_id) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,menu_id) DO UPDATE SET onsite_rate_id=excluded.onsite_rate_id,takeaway_rate_id=excluded.takeaway_rate_id",
        [r, a.menu, a.onsite, a.takeaway],
      );
      await log(db, r, user.id, "TVA du produit configurée", a.menu);
      return {};
    }
    case "categoryVat": {
      await one(
        db,
        "SELECT category FROM menu_items WHERE restaurant_id=$1 AND category=$2 LIMIT 1",
        [r, a.category],
      );
      for (const rate of [a.onsite, a.takeaway])
        if (rate) await activeRate(db, r, rate);
      await db.query(
        "INSERT INTO fin_category_vat(restaurant_id,category,onsite_rate_id,takeaway_rate_id) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,category) DO UPDATE SET onsite_rate_id=excluded.onsite_rate_id,takeaway_rate_id=excluded.takeaway_rate_id",
        [r, a.category, a.onsite, a.takeaway],
      );
      await log(db, r, user.id, "TVA de la catégorie configurée", a.category);
      return {};
    }
    case "applyConfigured": {
      const posted = await retryOpen(db, r, user, true);
      await log(
        db,
        r,
        user.id,
        `TVA configurée appliquée à ${posted} opération(s) en attente`,
      );
      return { posted };
    }
    case "resolve": {
      const item = await one<{ source_id: string }>(
        db,
        "SELECT e.source_id FROM fin_review_items v JOIN fin_events e ON e.id=v.event_id WHERE v.id=$1 AND v.restaurant_id=$2 AND v.status='open' FOR UPDATE OF v",
        [a.id, r],
      );
      const p = await one<Parameters<typeof declarationItems>[1]>(
        db,
        "SELECT id,session_id,order_id,amount,discount,method FROM payment_declarations WHERE id=$1",
        [item.source_id],
      );
      const allowed = new Set((await declarationItems(db, p)).map((i) => i.id));
      for (const assignment of a.assignments) {
        if (!allowed.has(assignment.item))
          throw new Error("Cette ligne n’appartient pas à l’opération.");
        const rate = await activeRate(db, r, assignment.rate);
        await db.query(
          "UPDATE order_items SET vat_rate_id=$2,vat_rate_bp=$3 WHERE id=$1",
          [assignment.item, rate.id, rate.rate_bp],
        );
      }
      const outcome = await processPayment(db, r, p.id);
      if (outcome === "posted")
        await closeReview(db, a.id, user, "TVA précisée");
      await log(db, r, user.id, `Opération vérifiée : ${outcome}`, a.id);
      return { outcome };
    }
    case "dismiss": {
      const changed = await db.query(
        "UPDATE fin_review_items SET status='dismissed',note=$3,resolved_by=$4,resolved_at=now() WHERE id=$1 AND restaurant_id=$2 AND status='open'",
        [a.id, r, a.note, user.id],
      );
      if (!changed.affectedRows) throw new Error("Opération déjà traitée.");
      await log(
        db,
        r,
        user.id,
        "Opération écartée de la comptabilisation",
        a.id,
      );
      return {};
    }
    case "reverse": {
      const created = await one<{ id: string }>(
        db,
        "SELECT app.fin_reverse_entry($1,$2,$3) AS id",
        [r, a.id, a.reason],
      );
      await log(db, r, user.id, "Écriture contre-passée", a.id);
      return { id: created.id };
    }
    case "verify": {
      const chain = await one<{ checked: number; broken_at: number | null }>(
        db,
        "SELECT checked,broken_at FROM app.fin_verify_chain($1)",
        [r],
      );
      await log(db, r, user.id, "Intégrité du journal vérifiée");
      return { chain };
    }
  }
}
