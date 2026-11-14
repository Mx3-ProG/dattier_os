/* Factures fournisseurs : dépôt, lecture assistée, validation humaine, écritures.
   Aucune écriture sans validation. Les appels externes ont lieu hors transaction. */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { requirePermission } from "@/core/permissions";
import { requireCommercialCapability } from "@/features/platform/entitlements";
import { log } from "@/features/orders/service";
import { ensureDefaults } from "@/features/finance/service";
import { normalize } from "@/domain/shared/text";

import { imageType } from "@/features/site/media";
import {
  categories,
  checkInvoice,
  dedupeKey,
  emptyDraft,
  type Category,
  type InvoiceDraft,
  type Issue,
} from "@/domain/invoices/checks";
/* Extraction IA optionnelle : chargée dynamiquement pour que le module factures
   ne dépende pas statiquement du module assistant (détachabilité). */
type InvoiceExtractor = {
  extractionEnabled: () => boolean;
  extractWithAi: (
    data: Buffer,
    contentType: string,
  ) => Promise<{
    draft: InvoiceDraft;
    uncertain: string[];
    isInvoice: boolean;
    costEur: number;
    model: string;
    credits: number;
  } | null>;
};
let extractorPromise: Promise<InvoiceExtractor | null> | null = null;
function loadInvoiceExtractor(): Promise<InvoiceExtractor | null> {
  if (extractorPromise) return extractorPromise;
  extractorPromise = (async () => {
    try {
      const moduleName = "@/features/assistant/invoice-extraction";
      const mod = (await import(moduleName)) as {
        extractionEnabled: () => boolean;
        extractWithAi: InvoiceExtractor["extractWithAi"];
      };
      return {
        extractionEnabled: mod.extractionEnabled,
        extractWithAi: mod.extractWithAi,
      };
    } catch {
      return null;
    }
  })();
  return extractorPromise;
}
import { saveDocument } from "./storage";
import { factureXFromPdf, parseInvoiceXml } from "./structured";

export type Run = <T>(fn: (tx: DB) => Promise<T>) => Promise<T>;
export const maxDocumentBytes = 15 * 1024 * 1024;

type Row = {
  id: string;
  document_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_vat: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  net: number | null;
  vat: number | null;
  gross: number | null;
  category: Category | null;
  source: string;
  uncertain: string[];
  status: string;
  paid_on: string | null;
  paid_method: string | null;
  filename: string;
  created_at: string;
};
const columns = `i.id,i.document_id,i.supplier_id,i.supplier_name,i.supplier_vat,i.invoice_number,i.invoice_date::text,i.due_date::text,i.net,i.vat,i.gross,i.category,i.source,i.uncertain,i.status,i.paid_on::text,i.paid_method,d.filename,i.created_at`;
const draftOf = (i: Row): InvoiceDraft => ({
  supplierName: i.supplier_name,
  supplierVat: i.supplier_vat,
  number: i.invoice_number,
  invoiceDate: i.invoice_date,
  dueDate: i.due_date,
  net: i.net,
  vat: i.vat,
  gross: i.gross,
  category: i.category,
});

export async function financeAccess(db: DB, r: string, user: Actor) {
  const scoped = await scope(db, user, r);
  requirePermission(scoped.roles ?? scoped.role, "finance");
  await requireCommercialCapability(db, r, "finance");
  return scoped;
}

export async function invoiceAccess(db: DB, r: string, user: Actor) {
  const scoped = await scope(db, user, r);
  requirePermission(scoped.roles ?? scoped.role, "finance");
  const { allowed } = await one<{allowed:boolean}>(db,"SELECT app.has_addon($1,'invoices') AS allowed",[r]);
  if (!allowed) throw new Error("L’add-on Factures fournisseurs n’est pas installé, son accès a expiré ou il n’est pas inclus dans ce forfait.");
  return scoped;
}

/** Reconnaît le format au contenu réel du fichier, jamais à son nom. */
export function documentType(data: Buffer) {
  if (data.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  const head = data.subarray(0, 300).toString("utf8").trimStart();
  if (head.startsWith("<?xml") || head.startsWith("<"))
    return "application/xml";
  try {
    return imageType(data);
  } catch {
    throw new Error("Format accepté : PDF, photo JPEG, PNG ou WebP, ou XML.");
  }
}
const cleanName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
    .trim()
    .slice(0, 120) || "document";

/** Le fournisseur existe-t-il déjà ? Comparaison insensible à la casse et aux accents. */
async function matchSupplier(db: DB, r: string, name: string | null) {
  if (!name) return null;
  const wanted = normalize(name).replace(/[^a-z0-9]/g, "");
  if (!wanted) return null;
  const known = await rows<{ id: string; name: string }>(
    db,
    "SELECT id,name FROM suppliers WHERE restaurant_id=$1",
    [r],
  );
  return (
    known.find((s) => normalize(s.name).replace(/[^a-z0-9]/g, "") === wanted)
      ?.id ?? null
  );
}

export type UploadResult = {
  id: string;
  duplicate: boolean;
  source: string;
  message: string;
};
export async function uploadInvoice(
  run: Run,
  r: string,
  rawUser: Actor,
  data: Buffer,
  filename: string,
): Promise<UploadResult> {
  if (!data.length || data.length > maxDocumentBytes)
    throw new Error("Document vide ou trop volumineux (15 Mo au maximum).");
  const type = documentType(data);
  const sha = createHash("sha256").update(data).digest("hex");
  const prior = await run(async (tx) => {
    await invoiceAccess(tx, r, rawUser);
    await ensureDefaults(tx, r);
    return (
      await rows<{ id: string }>(
        tx,
        "SELECT i.id FROM fin_supplier_invoices i JOIN fin_documents d ON d.id=i.document_id WHERE d.restaurant_id=$1 AND d.sha256=$2",
        [r, sha],
      )
    )[0];
  });
  if (prior)
    return {
      id: prior.id,
      duplicate: true,
      source: "manual",
      message: "Ce fichier a déjà été déposé.",
    };

  let draft: InvoiceDraft = emptyDraft();
  let source = "manual";
  let uncertain: string[] = [];
  let message = "À compléter : la lecture automatique n’est pas activée.";
  let usage: { credits: number; cost: number; model: string } | null = null;
  const structured =
    type === "application/pdf"
      ? await factureXFromPdf(data)
      : type === "application/xml"
        ? parseInvoiceXml(data.toString("utf8"))
        : null;
  if (structured) {
    draft = structured;
    source = type === "application/pdf" ? "facturx" : "xml";
    message = "Facture électronique lue : à valider.";
  } else if (type === "application/xml") {
    throw new Error("Ce fichier XML n’est pas une facture CII ou UBL.");
  } else {
    const extractor = await loadInvoiceExtractor();
    if (extractor?.extractionEnabled()) {
      try {
        const read = await extractor.extractWithAi(data, type);
        if (read) {
          draft = read.draft;
          uncertain = read.uncertain;
          source = "ai";
          usage = {
            credits: read.credits,
            cost: read.costEur,
            model: read.model,
          };
          message = read.isInvoice
            ? "Lue par l’IA : vérifiez chaque champ avant de valider."
            : "Ce document ne ressemble pas à une facture : vérifiez-le.";
        }
      } catch {
        message = "Lecture automatique indisponible : à compléter à la main.";
      }
    }
  }

  const documentId = randomUUID(),
    id = randomUUID(),
    key = `${r}/finance/${documentId}`;
  await saveDocument(key, data, type);
  await run(async (tx) => {
    const scoped = await invoiceAccess(tx, r, rawUser);
    await tx.query(
      "INSERT INTO fin_documents(id,restaurant_id,object_key,sha256,filename,content_type,bytes,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        documentId,
        r,
        key,
        sha,
        cleanName(filename),
        type,
        data.length,
        scoped.id,
      ],
    );
    await tx.query(
      "INSERT INTO fin_supplier_invoices(id,restaurant_id,document_id,supplier_id,supplier_name,supplier_vat,invoice_number,invoice_date,due_date,net,vat,gross,category,source,uncertain) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [
        id,
        r,
        documentId,
        await matchSupplier(tx, r, draft.supplierName),
        draft.supplierName,
        draft.supplierVat,
        draft.number,
        safeDate(draft.invoiceDate),
        safeDate(draft.dueDate),
        amount(draft.net),
        amount(draft.vat),
        amount(draft.gross),
        draft.category,
        source,
        JSON.stringify(uncertain),
      ],
    );
    if (usage)
      await tx.query("SELECT app.ai_consume($1,$2,$3,$4,$5,true)", [
        r,
        usage.credits,
        usage.model,
        "Lecture d’une facture fournisseur",
        Math.round(usage.cost * 1_000_000),
      ]);
    await log(tx, r, scoped.id, "Facture fournisseur déposée", id);
  });
  return { id, duplicate: false, source, message };
}
// Une valeur lue mais inexploitable reste vide : elle sera demandée, pas devinée.
const safeDate = (value: string | null) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : null;
const amount = (value: number | null) =>
  value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null;

async function duplicatesOf(db: DB, r: string, i: Row): Promise<Issue[]> {
  if (!i.supplier_name || !i.invoice_number) return [];
  const others = await rows<{ supplier_name: string; invoice_number: string }>(
    db,
    "SELECT supplier_name,invoice_number FROM fin_supplier_invoices WHERE restaurant_id=$1 AND id<>$2 AND status<>'cancelled' AND invoice_number IS NOT NULL AND supplier_name IS NOT NULL",
    [r, i.id],
  );
  const key = dedupeKey(i.supplier_name, i.invoice_number);
  return others.some(
    (o) => dedupeKey(o.supplier_name, o.invoice_number) === key,
  )
    ? [
        {
          level: "blocking",
          message: "Une facture de ce fournisseur porte déjà ce numéro.",
        },
      ]
    : [];
}

export async function invoicesState(db: DB, r: string, user: Actor) {
  await invoiceAccess(db, r, user);
  await ensureDefaults(db, r);
  const list = await rows<Row>(
    db,
    `SELECT ${columns} FROM fin_supplier_invoices i JOIN fin_documents d ON d.id=i.document_id
      WHERE i.restaurant_id=$1 ORDER BY (i.status='to_review') DESC,i.created_at DESC LIMIT 200`,
    [r],
  );
  const invoices = [];
  for (const i of list)
    invoices.push({
      ...i,
      issues:
        i.status === "to_review"
          ? [...checkInvoice(draftOf(i)), ...(await duplicatesOf(db, r, i))]
          : [],
    });
  const settings = await one<{ vat_regime: string }>(
    db,
    "SELECT vat_regime FROM fin_settings WHERE restaurant_id=$1",
    [r],
  );
  return {
    aiEnabled: (await loadInvoiceExtractor())?.extractionEnabled() ?? false,
    vatRegime: settings.vat_regime,
    categories: Object.entries(categories).map(([id, c]) => ({
      id,
      label: c.label,
    })),
    invoices,
  };
}

const id = z.string().min(1).max(100);
const money = z.number().int().min(0).max(100_000_000);
const date = z.iso.date();
export const invoiceActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("validate"),
    id,
    supplierName: z.string().trim().min(1).max(200),
    supplierVat: z.string().trim().max(40).nullable(),
    number: z.string().trim().min(1).max(80),
    invoiceDate: date,
    dueDate: date.nullable(),
    net: money,
    vat: money,
    gross: money,
    category: z.enum(Object.keys(categories) as [Category, ...Category[]]),
  }),
  z.object({
    action: z.literal("pay"),
    id,
    paidOn: date,
    method: z.enum(["bank", "card", "cash"]),
  }),
  z.object({
    action: z.literal("cancel"),
    id,
    reason: z.string().trim().min(10).max(200),
  }),
  z.object({ action: z.literal("reopen"), id }),
]);

const lock = (db: DB, r: string, invoice: string) =>
  one<Row>(
    db,
    `SELECT ${columns} FROM fin_supplier_invoices i JOIN fin_documents d ON d.id=i.document_id WHERE i.id=$1 AND i.restaurant_id=$2 FOR UPDATE OF i`,
    [invoice, r],
  );

export async function invoiceAction(
  db: DB,
  r: string,
  rawUser: Actor,
  a: z.infer<typeof invoiceActionSchema>,
) {
  const user = await invoiceAccess(db, r, rawUser);
  await ensureDefaults(db, r);
  const invoice = await lock(db, r, a.id);
  switch (a.action) {
    case "validate": {
      if (invoice.status !== "to_review")
        throw new Error("Cette facture a déjà été traitée.");
      const settings = await one<{ vat_regime: string }>(
        db,
        "SELECT vat_regime FROM fin_settings WHERE restaurant_id=$1",
        [r],
      );
      if (settings.vat_regime === "unknown")
        throw new Error(
          "Déclarez d’abord le régime de TVA dans Opérations à vérifier.",
        );
      const draft: InvoiceDraft = {
        supplierName: a.supplierName,
        supplierVat: a.supplierVat,
        number: a.number,
        invoiceDate: a.invoiceDate,
        dueDate: a.dueDate,
        net: a.net,
        vat: a.vat,
        gross: a.gross,
        category: a.category,
      };
      const blocking = [
        ...checkInvoice(draft),
        ...(await duplicatesOf(db, r, {
          ...invoice,
          supplier_name: a.supplierName,
          invoice_number: a.number,
        })),
      ].filter((i) => i.level === "blocking");
      if (blocking.length) throw new Error(blocking[0].message);
      // Fournisseur inconnu : ajouté au carnet, sans ressaisie.
      let supplier = await matchSupplier(db, r, a.supplierName);
      if (!supplier) {
        supplier = randomUUID();
        await db.query(
          "INSERT INTO suppliers(id,restaurant_id,name,contact) VALUES($1,$2,$3,'')",
          [supplier, r, a.supplierName],
        );
      }
      await db.query(
        "UPDATE fin_supplier_invoices SET supplier_id=$2,supplier_name=$3,supplier_vat=$4,invoice_number=$5,invoice_date=$6,due_date=$7,net=$8,vat=$9,gross=$10,category=$11,status='validated',dedupe_key=$12,validated_by=$13,validated_at=now(),uncertain='[]' WHERE id=$1",
        [
          a.id,
          supplier,
          a.supplierName,
          a.supplierVat,
          a.number,
          a.invoiceDate,
          a.dueDate,
          a.net,
          a.vat,
          a.gross,
          a.category,
          dedupeKey(a.supplierName, a.number),
          user.id,
        ],
      );
      // En franchise, la TVA n’est pas récupérable : elle reste une charge.
      const deductible = settings.vat_regime === "normal" ? a.vat : 0;
      const label = `Facture ${a.number} · ${a.supplierName}`.slice(0, 200);
      await db.query(
        "SELECT app.fin_post_invoice($1,$2,'invoice.validated',$3,$4,'purchase',$5,$6::date,$7,'AC')",
        [
          r,
          `invoice:${a.id}`,
          a.id,
          a.gross,
          label,
          a.invoiceDate,
          JSON.stringify(
            [
              {
                account: categories[a.category].account,
                debit: a.gross - deductible,
                credit: 0,
                label: categories[a.category].label,
              },
              {
                account: "44566",
                debit: deductible,
                credit: 0,
                label: "TVA déductible",
              },
              {
                account: "401",
                debit: 0,
                credit: a.gross,
                label: "Fournisseur",
              },
            ].filter((l) => l.debit + l.credit > 0),
          ),
        ],
      );
      await log(db, r, user.id, "Facture fournisseur validée", a.id);
      return { status: "validated" };
    }
    case "pay": {
      if (invoice.status !== "validated")
        throw new Error("Seule une facture validée peut être réglée.");
      await db.query(
        "UPDATE fin_supplier_invoices SET status='paid',paid_on=$2,paid_method=$3 WHERE id=$1",
        [a.id, a.paidOn, a.method],
      );
      await db.query(
        "SELECT app.fin_post_invoice($1,$2,'invoice.paid',$3,$4,'purchase_payment',$5,$6::date,$7,'BQ')",
        [
          r,
          `invoice-paid:${a.id}`,
          a.id,
          invoice.gross,
          `Règlement facture ${invoice.invoice_number}`.slice(0, 200),
          a.paidOn,
          JSON.stringify([
            {
              account: "401",
              debit: invoice.gross,
              credit: 0,
              label: "Fournisseur",
            },
            {
              account: a.method === "cash" ? "530" : "512",
              debit: 0,
              credit: invoice.gross,
              label: a.method === "cash" ? "Caisse" : "Banque",
            },
          ]),
        ],
      );
      await log(db, r, user.id, "Facture fournisseur réglée", a.id);
      return { status: "paid" };
    }
    case "cancel": {
      if (invoice.status === "cancelled")
        throw new Error("Cette facture est déjà annulée.");
      if (
        (
          await rows(
            db,
            "SELECT match_id FROM fin_bank_match_targets WHERE restaurant_id=$1 AND target_key=$2",
            [r, `invoice:${a.id}`],
          )
        ).length
      )
        throw new Error(
          "Cette facture est rapprochée d’un mouvement bancaire : annulez d’abord le rapprochement.",
        );
      await db.query("SELECT app.fin_reverse_invoice($1,$2,$3)", [
        r,
        a.id,
        a.reason,
      ]);
      await db.query(
        "UPDATE fin_supplier_invoices SET status='cancelled',note=$2,paid_on=NULL,paid_method=NULL WHERE id=$1",
        [a.id, a.reason],
      );
      await log(db, r, user.id, "Facture fournisseur annulée", a.id);
      return { status: "cancelled" };
    }
    case "reopen": {
      if (invoice.status !== "cancelled")
        throw new Error("Seule une facture annulée peut être reprise.");
      await db.query(
        "UPDATE fin_supplier_invoices SET status='to_review',note=NULL WHERE id=$1",
        [a.id],
      );
      await log(db, r, user.id, "Facture fournisseur reprise", a.id);
      return { status: "to_review" };
    }
  }
}

/** Justificatif demandé : les droits sont vérifiés avant toute lecture du stockage. */
export async function documentFor(
  db: DB,
  r: string,
  user: Actor,
  invoice: string,
) {
  await invoiceAccess(db, r, user);
  return one<{ object_key: string; content_type: string; filename: string }>(
    db,
    "SELECT d.object_key,d.content_type,d.filename FROM fin_supplier_invoices i JOIN fin_documents d ON d.id=i.document_id WHERE i.id=$1 AND i.restaurant_id=$2",
    [invoice, r],
  );
}
