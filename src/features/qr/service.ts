import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions";
import { productPath } from "@/lib/product-pages";
import { log } from "@/features/orders/service";
import { requirePaidAddon } from "@/features/platform/entitlements";

/**
 * Traced QR codes. Each object of the establishment gets a short link
 * /q/<token>: the scan is recorded, then the visitor is sent to the right
 * place: the public page for a customer, the right module for the team.
 */

export type QrGroup =
  | "etablissement"
  | "salle"
  | "carte"
  | "promotions"
  | "clients"
  | "commandes"
  | "reservations"
  | "stocks"
  | "equipe"
  | "perso";

export const qrGroups: { id: QrGroup; label: string }[] = [
  { id: "etablissement", label: "Établissement" },
  { id: "salle", label: "Plan de salle" },
  { id: "carte", label: "Carte & recettes" },
  { id: "promotions", label: "Promotions" },
  { id: "clients", label: "Clients" },
  { id: "commandes", label: "Commandes" },
  { id: "reservations", label: "Réservations" },
  { id: "stocks", label: "Stocks & achats" },
  { id: "equipe", label: "Équipe" },
  { id: "perso", label: "Personnalisés" },
];

type KindSpec = {
  name: string;
  group: QrGroup;
  /** Dashboard module opened when a team member scans. */
  module: string;
  /** Who may see it in the portfolio. */
  permission?: Permission;
  /** Only the team can use it: a customer is asked to log in. */
  staffOnly?: boolean;
  /** Generated from the establishment's data and archived when the object disappears. */
  auto?: boolean;
};

export const qrKinds = {
  site: { name: "Site de l’établissement", group: "etablissement", module: "overview", auto: true },
  menu: { name: "La carte", group: "etablissement", module: "menu", auto: true },
  "order-online": { name: "Commander en ligne", group: "etablissement", module: "orders", auto: true },
  booking: { name: "Réserver une table", group: "etablissement", module: "reservations", auto: true },
  account: { name: "Espace client & fidélité", group: "etablissement", module: "customers", auto: true },
  reviews: { name: "Laisser un avis", group: "etablissement", module: "customers", auto: true },
  table: { name: "Table", group: "salle", module: "dining", permission: "floor", auto: true },
  product: { name: "Produit", group: "carte", module: "menu", permission: "catalog", auto: true },
  recipe: { name: "Fiche recette", group: "carte", module: "recipes", permission: "catalog", staffOnly: true, auto: true },
  flash: { name: "Promo flash", group: "promotions", module: "menu", permission: "catalog", auto: true },
  promo: { name: "Code promo", group: "promotions", module: "customers", permission: "customers", auto: true },
  customer: { name: "Carte membre", group: "clients", module: "customers", permission: "customers" },
  referral: { name: "Lien de parrainage", group: "clients", module: "customers", permission: "customers" },
  order: { name: "Commande", group: "commandes", module: "orders", permission: "orders" },
  reservation: { name: "Réservation", group: "reservations", module: "reservations", permission: "reservations" },
  supplier: { name: "Fournisseur", group: "stocks", module: "suppliers", permission: "purchases", staffOnly: true, auto: true },
  ingredient: { name: "Ingrédient en stock", group: "stocks", module: "stocks", permission: "stock", staffOnly: true, auto: true },
  delivery: { name: "Livraison attendue", group: "stocks", module: "deliveries", permission: "purchases", staffOnly: true, auto: true },
  clock: { name: "Pointage de l’équipe", group: "equipe", module: "attendance", staffOnly: true, auto: true },
  planning: { name: "Planning de l’équipe", group: "equipe", module: "team", staffOnly: true, auto: true },
  custom: { name: "Lien personnalisé", group: "perso", module: "overview" },
} satisfies Record<string, KindSpec>;

export type QrKind = keyof typeof qrKinds;
export const isQrKind = (k: string): k is QrKind => k in qrKinds;

const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
export function qrToken() {
  return Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
}

export type QrRow = {
  id: string;
  token: string;
  kind: QrKind;
  ref: string;
  label: string;
  target: string | null;
};

/** Returns the code of an object, creating it the first time. */
export async function ensureQr(
  db: DB,
  r: string,
  kind: QrKind,
  ref: string,
  label: string,
  options: { target?: string | null; user?: string | null } = {},
): Promise<QrRow> {
  const found = await rows<QrRow & { archived_at: string | null }>(
    db,
    "SELECT id,token,kind,ref,label,target,archived_at FROM qr_codes WHERE restaurant_id=$1 AND kind=$2 AND ref=$3",
    [r, kind, ref],
  );
  if (found.length) {
    const q = found[0];
    if (q.archived_at || q.label !== label)
      await db.query(
        "UPDATE qr_codes SET archived_at=NULL,label=$2 WHERE id=$1",
        [q.id, label],
      );
    return { ...q, label };
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const token = qrToken();
    const inserted = await rows<QrRow>(
      db,
      `INSERT INTO qr_codes(id,restaurant_id,token,kind,ref,label,target,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING RETURNING id,token,kind,ref,label,target`,
      [randomUUID(), r, token, kind, ref, label, options.target ?? null, options.user ?? null],
    );
    if (inserted.length) return inserted[0];
    // Same object created concurrently: reuse it.
    const again = await rows<QrRow>(
      db,
      "SELECT id,token,kind,ref,label,target FROM qr_codes WHERE restaurant_id=$1 AND kind=$2 AND ref=$3",
      [r, kind, ref],
    );
    if (again.length) return again[0];
  }
  throw new Error("Impossible de générer le QR code, réessayez.");
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Every object that must have its QR code right now. */
async function desiredCodes(db: DB, r: string) {
  const list: { kind: QrKind; ref: string; label: string }[] = [
    { kind: "site", ref: r, label: "Site de l’établissement" },
    { kind: "menu", ref: r, label: "La carte" },
    { kind: "order-online", ref: r, label: "Commander en click & collect" },
    { kind: "booking", ref: r, label: "Réserver une table" },
    { kind: "account", ref: r, label: "Espace client & fidélité" },
    { kind: "reviews", ref: r, label: "Laisser un avis" },
    { kind: "clock", ref: r, label: "Pointage arrivée / départ" },
    { kind: "planning", ref: r, label: "Planning de l’équipe" },
  ];
  for (const t of await rows<{ id: string; number: number; label: string; zone: string }>(
    db,
    "SELECT id,number,label,zone FROM dining_tables WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY number",
    [r],
  ))
    list.push({
      kind: "table",
      ref: t.id,
      label: `Table ${t.number}${t.label ? ` · ${t.label}` : ""} · ${t.zone}`,
    });
  for (const p of await rows<{ id: string; name: string; category: string }>(
    db,
    "SELECT id,name,category FROM menu_items WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY category,name",
    [r],
  )) {
    list.push({ kind: "product", ref: p.id, label: `${p.name} · ${p.category}` });
    list.push({ kind: "recipe", ref: p.id, label: `Recette · ${p.name}` });
  }
  for (const f of await rows<{ id: string; name: string; kind: string; value: number }>(
    db,
    "SELECT f.id,m.name,f.kind,f.value FROM flash_promotions f JOIN menu_items m ON m.id=f.menu_id WHERE f.restaurant_id=$1 AND f.active AND f.ends_at>now()",
    [r],
  ))
    list.push({
      kind: "flash",
      ref: f.id,
      label: `Flash ${f.kind === "percent" ? `−${f.value} %` : money(f.value)} · ${f.name}`,
    });
  for (const p of await rows<{ id: string; code: string; name: string | null }>(
    db,
    "SELECT p.id,p.code,c.name FROM promo_codes p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.restaurant_id=$1 AND p.status='active' AND p.expires_on>=CURRENT_DATE",
    [r],
  ))
    list.push({ kind: "promo", ref: p.id, label: `${p.code}${p.name ? ` · ${p.name}` : ""}` });
  for (const s of await rows<{ id: string; name: string }>(
    db,
    "SELECT id,name FROM suppliers WHERE restaurant_id=$1 ORDER BY name",
    [r],
  ))
    list.push({ kind: "supplier", ref: s.id, label: s.name });
  for (const i of await rows<{ id: string; name: string }>(
    db,
    "SELECT id,name FROM ingredients WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY name",
    [r],
  ))
    list.push({ kind: "ingredient", ref: i.id, label: i.name });
  for (const d of await rows<{ id: string; supplier: string; ingredient: string; due_on: string }>(
    db,
    "SELECT p.id,s.name AS supplier,i.name AS ingredient,p.due_on::text FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id JOIN ingredients i ON i.id=p.ingredient_id WHERE p.restaurant_id=$1 AND p.status IN ('confirmed','partial') ORDER BY p.due_on",
    [r],
  ))
    list.push({
      kind: "delivery",
      ref: d.id,
      label: `${d.supplier} · ${d.ingredient} · ${new Date(d.due_on).toLocaleDateString("fr-FR")}`,
    });
  return list;
}

/**
 * Creates the missing codes, refreshes labels and archives the codes whose
 * object disappeared (a removed table, an archived dish…). Idempotent.
 */
export async function syncQrCodes(db: DB, r: string) {
  const desired = await desiredCodes(db, r);
  const existing = await rows<{ id: string; kind: QrKind; ref: string; label: string; archived_at: string | null }>(
    db,
    "SELECT id,kind,ref,label,archived_at FROM qr_codes WHERE restaurant_id=$1",
    [r],
  );
  const byKey = new Map(existing.map((q) => [`${q.kind}:${q.ref}`, q]));
  const wanted = new Set<string>();
  for (const d of desired) {
    const key = `${d.kind}:${d.ref}`;
    wanted.add(key);
    const q = byKey.get(key);
    if (!q || q.archived_at || q.label !== d.label) await ensureQr(db, r, d.kind, d.ref, d.label);
  }
  for (const q of existing)
    if (
      !q.archived_at &&
      (qrKinds[q.kind] as KindSpec | undefined)?.auto &&
      !wanted.has(`${q.kind}:${q.ref}`)
    )
      await db.query("UPDATE qr_codes SET archived_at=now() WHERE id=$1", [q.id]);
}

export type PortfolioCode = QrRow & {
  group: QrGroup;
  kind_name: string;
  scans: number;
  scans_7d: number;
  last_scan: string | null;
  staff_only: boolean;
  created_at: string;
};

/** Every active code the member may see, with scan statistics. */
export async function qrPortfolio(db: DB, r: string, user: Actor) {
  await requirePaidAddon(db,r,"qr");
  await syncQrCodes(db, r);
  const role = user.roles ?? user.role;
  const allowed = (Object.keys(qrKinds) as QrKind[]).filter((k) => {
    const spec = qrKinds[k] as KindSpec;
    return !spec.permission || can(role, spec.permission);
  });
  const codes = await rows<QrRow & { created_at: string; scans: number; scans_7d: number; last_scan: string | null }>(
    db,
    `SELECT q.id,q.token,q.kind,q.ref,q.label,q.target,q.created_at,
            count(s.id)::int AS scans,
            count(s.id) FILTER (WHERE s.scanned_at>now()-interval '7 days')::int AS scans_7d,
            max(s.scanned_at) AS last_scan
       FROM qr_codes q LEFT JOIN qr_scans s ON s.qr_id=q.id
      WHERE q.restaurant_id=$1 AND q.archived_at IS NULL AND q.kind = ANY($2)
        AND (q.kind NOT IN ('order','reservation') OR q.created_at>now()-interval '30 days')
      GROUP BY q.id
      ORDER BY q.kind,q.label`,
    [r, allowed],
  );
  const restaurant = await one<{ name: string }>(db, "SELECT name FROM restaurants WHERE id=$1", [r]);
  return {
    restaurant: restaurant.name,
    groups: qrGroups,
    kinds: Object.fromEntries(
      Object.entries(qrKinds).map(([k, v]) => [k, { name: v.name, group: v.group }]),
    ),
    codes: codes.map((c) => {
      const spec = qrKinds[c.kind] as KindSpec;
      return {
        ...c,
        group: spec.group,
        kind_name: spec.name,
        staff_only: Boolean(spec.staffOnly),
        created_at: new Date(c.created_at).toISOString(),
        last_scan: c.last_scan ? new Date(c.last_scan).toISOString() : null,
      } satisfies PortfolioCode;
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Team actions: generator and on-demand codes                         */
/* ------------------------------------------------------------------ */

/** A custom link: a page of the site ("/carte") or an https address. */
export const customTarget = z
  .string()
  .trim()
  .max(500)
  .refine(
    (t) => /^\/(?!\/)[^\s\\]*$/.test(t) || /^https:\/\/[^\s]+$/.test(t),
    "Indiquez une page du site (ex. /carte) ou une adresse https://.",
  );

export const qrActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("custom"),
    label: z.string().trim().min(2).max(80),
    target: customTarget,
  }),
  z.object({ action: z.literal("archive"), id: z.string().min(1) }),
  z.object({
    action: z.literal("ensure"),
    kind: z.enum(["order", "reservation", "customer", "referral"]),
    ref: z.string().min(1).max(100),
  }),
]);

const permissionOf = (kind: QrKind) => (qrKinds[kind] as KindSpec).permission;

export async function qrAction(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof qrActionSchema>,
) {
  await requirePaidAddon(db,r,"qr");
  const role = user.roles ?? user.role;
  if (a.action === "custom") {
    const id = randomUUID();
    const q = await ensureQr(db, r, "custom", id, a.label, { target: a.target, user: user.id });
    await log(db, r, user.id, `QR code personnalisé créé : ${a.label}`, q.id);
    return q;
  }
  if (a.action === "archive") {
    const q = await one<{ kind: QrKind; label: string }>(
      db,
      "SELECT kind,label FROM qr_codes WHERE id=$1 AND restaurant_id=$2",
      [a.id, r],
    );
    if (q.kind !== "custom")
      throw new Error("Seuls les QR codes personnalisés se suppriment ; les autres suivent leur objet.");
    await db.query("UPDATE qr_codes SET archived_at=now() WHERE id=$1", [a.id]);
    await log(db, r, user.id, `QR code personnalisé archivé : ${q.label}`, a.id);
    return { ok: true };
  }
  const permission = permissionOf(a.kind);
  if (permission && !can(role, permission)) throw new Error("Accès refusé.");
  return ensureQr(db, r, a.kind, a.ref, await labelFor(db, r, a.kind, a.ref));
}

/** Human label of an on-demand object; also checks it belongs to the establishment. */
export async function labelFor(db: DB, r: string, kind: QrKind, ref: string) {
  if (kind === "order") {
    const o = await one<{ number: number | null; customer_name: string; table_number: number | null }>(
      db,
      `SELECT so.number,o.customer_name,t.number AS table_number
         FROM orders o LEFT JOIN shop_orders so ON so.order_id=o.id
         LEFT JOIN table_sessions ts ON ts.id=o.session_id LEFT JOIN dining_tables t ON t.id=ts.table_id
        WHERE o.id=$1 AND o.restaurant_id=$2`,
      [ref, r],
    );
    return o.number
      ? `Commande #${o.number}${o.customer_name ? ` · ${o.customer_name}` : ""}`
      : `Commande ${o.table_number ? `table ${o.table_number}` : ref.slice(0, 6)}${o.customer_name ? ` · ${o.customer_name}` : ""}`;
  }
  if (kind === "reservation") {
    const b = await one<{ name: string; guests: number; starts_at: string }>(
      db,
      "SELECT name,guests,starts_at FROM reservations WHERE id=$1 AND restaurant_id=$2",
      [ref, r],
    );
    return `Réservation ${b.name} · ${b.guests} pers. · ${new Date(b.starts_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  }
  const c = await one<{ name: string }>(
    db,
    "SELECT name FROM customers WHERE id=$1 AND restaurant_id=$2",
    [ref, r],
  );
  return kind === "customer" ? `Carte membre · ${c.name}` : `Parrainage · ${c.name}`;
}

/* ------------------------------------------------------------------ */
/* Scan resolution                                                     */
/* ------------------------------------------------------------------ */

export type ScanTarget = { kind: QrKind; ref: string; target: string | null; restaurant: string };

const site = (r: string, path = "") => `/r/${encodeURIComponent(r)}${path}`;
const dashboard = (r: string, module: string, focus?: string) =>
  `/dashboard?restaurant=${encodeURIComponent(r)}&module=${module}${focus ? `&focus=${encodeURIComponent(focus)}` : ""}`;

/**
 * Where a scan leads. The team lands on the right module of the dashboard,
 * customers on the public page; team-only codes ask customers to log in.
 */
export async function scanDestination(
  db: DB,
  q: ScanTarget,
  staff: boolean,
  token: string,
): Promise<string> {
  const { kind, ref, restaurant: r } = q;
  if (kind === "custom")
    return q.target?.startsWith("/") ? site(r, q.target === "/" ? "" : q.target) : q.target || site(r);
  if (kind === "clock") return `/pointage?restaurant=${encodeURIComponent(r)}`;
  if (staff) {
    if (kind === "planning") return dashboard(r, "team");
    return dashboard(r, (qrKinds[kind] as KindSpec).module, ref === r ? undefined : ref);
  }
  if ((qrKinds[kind] as KindSpec).staffOnly)
    return `/auth/login?returnTo=${encodeURIComponent(`/q/${token}`)}`;
  switch (kind) {
    case "site":
      return site(r);
    case "menu":
      return site(r, "/carte");
    case "order-online":
      return site(r, "/commander");
    case "booking":
      return site(r, "/reservations");
    case "account":
    case "customer":
      return site(r, "/compte");
    case "reviews":
      return site(r, "/avis");
    case "reservation":
      return site(r, "/compte?onglet=historique");
    case "table": {
      const t = await rows<{ number: number }>(
        db,
        "SELECT number FROM dining_tables WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL",
        [ref, r],
      );
      return t.length ? site(r, `/commander?table=${t[0].number}`) : site(r, "/carte");
    }
    case "product":
      return site(r, productPath(ref));
    case "flash": {
      const f = await rows<{ menu_id: string }>(
        db,
        "SELECT menu_id FROM flash_promotions WHERE id=$1 AND restaurant_id=$2",
        [ref, r],
      );
      return f.length ? site(r, productPath(f[0].menu_id)) : site(r, "/carte");
    }
    case "promo": {
      const p = await rows<{ token: string }>(
        db,
        "SELECT token FROM promo_codes WHERE id=$1 AND restaurant_id=$2",
        [ref, r],
      );
      return p.length ? `/avantage?token=${p[0].token}` : site(r, "/compte");
    }
    case "referral": {
      const c = await rows<{ code: string }>(
        db,
        "SELECT code FROM customer_referral_codes WHERE customer_id=$1 AND restaurant_id=$2",
        [ref, r],
      );
      return site(r, c.length ? `/compte?parrain=${c[0].code}` : "/compte");
    }
    case "order": {
      const o = await rows<{ token: string }>(
        db,
        "SELECT token FROM shop_orders so JOIN orders o ON o.id=so.order_id WHERE so.order_id=$1 AND o.restaurant_id=$2",
        [ref, r],
      );
      return o.length ? site(r, `/suivi#${o[0].token}`) : site(r);
    }
    default:
      return site(r);
  }
}
