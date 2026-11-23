import { z } from "zod";
import {
  allergenList,
  isTradeTool,
  tradeTool,
  tradeTools,
  type TradeEntity,
  type TradeSource,
  type TradeTool,
} from "./definitions";
import {
  allergenSchema,
  builtinSegment,
  builtinSegments,
  formatAllergens,
  matchesCustomSegment,
  overlaps,
  parseAllergens,
  parseTradeData,
  quoteTotals,
  type CustomerStats,
  type QuoteLine,
} from "./model";
import { log } from "@/features/orders/service";
import { authenticated as authenticatedRequest } from "@/features/platform/http";
import { withBusinessErrors } from "@/features/addons/store-service";
import { scope } from "@/infrastructure/auth/session";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { can } from "@/core/permissions";

const authenticated: typeof authenticatedRequest = (restaurant, fn) =>
  withBusinessErrors(() => authenticatedRequest(restaurant, fn));

export type TradeRecord = { id: string; entity: string; data: Record<string, unknown>; created_at: string; updated_at: string };
export type Tone = "good" | "warn" | "bad" | "neutral";
export type TradePanel =
  | { type: "kpis"; items: { label: string; value: string; hint?: string; tone?: Tone }[] }
  | { type: "bars"; title: string; items: { label: string; value: number; display: string; tone?: Tone }[]; empty?: string }
  | { type: "table"; title: string; columns: string[]; rows: string[][]; empty?: string }
  | { type: "timeline"; title: string; items: { label: string; group: string; start: string; end: string; tone: Tone }[]; empty?: string }
  | { type: "note"; text: string; tone?: Tone };
type Option = { value: string; label: string };
export type Scoped = Awaited<ReturnType<typeof scope>>;

const euro = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const pct = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} %`;
const num = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
const day = (value: string | null | undefined) =>
  value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "—";
const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const daysAgo = (value: string) => (Date.now() - Date.parse(value)) / 86_400_000;
/** Instant correspondant à « date à hour:00 » à l’heure de Paris, quel que soit le fuseau du serveur. */
export function parisTime(date: string, hour: number) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess)
      .map((part) => [part.type, part.value]),
  );
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return guess - (shown - guess);
}
const str = (value: unknown) => (typeof value === "string" ? value : "");
const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

async function installed(db: DB, restaurant: string, tool: string) {
  return (await one<{ ok: boolean }>(db, "SELECT app.addon_installed($1,$2) AS ok", [restaurant, tool])).ok;
}
function allowed(scoped: Scoped, tool: TradeTool) {
  return tool.permission === null || can(scoped.roles ?? scoped.role, tool.permission);
}
async function access(db: DB, restaurant: string, scoped: Scoped, id: string) {
  const tool = isTradeTool(id) ? tradeTool(id) : undefined;
  if (!tool) throw new Error("Outil inconnu.");
  if (!(await installed(db, restaurant, tool.id))) throw new Error("Cet outil n’est pas installé dans cet établissement.");
  if (!allowed(scoped, tool)) throw new Error("Accès refusé pour ce profil.");
  return tool;
}
const records = (db: DB, restaurant: string, tool: string) =>
  rows<TradeRecord>(
    db,
    "SELECT id,entity,data,created_at,updated_at FROM trade_records WHERE restaurant_id=$1 AND tool_id=$2 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 2000",
    [restaurant, tool],
  );
const byEntity = (list: readonly TradeRecord[], entity: string) => list.filter((record) => record.entity === entity);
const settingsOf = (list: readonly TradeRecord[]) => byEntity(list, "settings")[0]?.data ?? {};

type MenuRow = { id: string; name: string; price: number; cost: number | null; allergens: string };
const menu = (db: DB, restaurant: string) =>
  rows<MenuRow>(
    db,
    `SELECT m.id,m.name,m.price,m.allergens,
       CASE WHEN count(ri.ingredient_id)=0 THEN NULL ELSE round(sum(ri.quantity*i.cost)*100)::int END AS cost
       FROM menu_items m LEFT JOIN recipe_ingredients ri ON ri.menu_id=m.id
       LEFT JOIN ingredients i ON i.id=ri.ingredient_id
      WHERE m.restaurant_id=$1 AND m.archived_at IS NULL
      GROUP BY m.id,m.name,m.price,m.allergens ORDER BY m.name LIMIT 300`,
    [restaurant],
  );
type IngredientRow = { id: string; name: string; unit: string; cost: number };
const ingredients = (db: DB, restaurant: string) =>
  rows<IngredientRow>(
    db,
    "SELECT id,name,unit,cost::float AS cost FROM ingredients WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY name LIMIT 500",
    [restaurant],
  );
async function customerStats(db: DB, restaurant: string): Promise<CustomerStats[]> {
  const list = await rows<{ id: string; name: string; contact: string; points: number; orders: number; spend: number; last_order: string | null; first_order: string | null }>(
    db,
    `SELECT c.id,c.name,c.contact,c.points,count(s.order_id)::int AS orders,coalesce(sum(s.total),0)::int AS spend,
        max(o.created_at) AS last_order,min(o.created_at) AS first_order
       FROM customers c
       LEFT JOIN shop_orders s ON s.customer_id=c.id
       LEFT JOIN orders o ON o.id=s.order_id AND o.status<>'cancelled'
      WHERE c.restaurant_id=$1 GROUP BY c.id ORDER BY c.name LIMIT 5000`,
    [restaurant],
  );
  return list.map((row) => ({
    id: row.id, name: row.name, contact: row.contact, points: row.points, orders: row.orders, spend: row.spend,
    lastOrder: row.last_order ? new Date(row.last_order).toISOString() : null,
    firstOrder: row.first_order ? new Date(row.first_order).toISOString() : null,
  }));
}
/** Segments sur mesure lus seulement si l’outil Segments est installé (la RLS l’impose). */
const customSegments = (db: DB, restaurant: string) =>
  rows<TradeRecord>(
    db,
    "SELECT id,entity,data,created_at,updated_at FROM trade_records WHERE restaurant_id=$1 AND tool_id='customer-segments' AND entity='segment' AND archived_at IS NULL",
    [restaurant],
  );
function segmentMembers(stats: readonly CustomerStats[], segments: readonly TradeRecord[], name: string) {
  if ((builtinSegments as readonly string[]).includes(name)) return stats.filter((customer) => builtinSegment(customer) === name);
  const rule = segments.find((segment) => segment.data.name === name)?.data;
  return rule ? stats.filter((customer) => matchesCustomSegment(customer, rule as never)) : [];
}

async function sources(db: DB, restaurant: string, tool: TradeTool) {
  const wanted = new Set<TradeSource>();
  for (const entity of tool.entities) for (const field of entity.fields) if (field.source) wanted.add(field.source);
  const result: Partial<Record<TradeSource, Option[]>> = {};
  if (wanted.has("menu")) result.menu = (await menu(db, restaurant)).map((item) => ({ value: item.id, label: `${item.name} · ${euro(item.price)}` }));
  if (wanted.has("ingredients"))
    result.ingredients = (await ingredients(db, restaurant)).map((item) => ({ value: item.id, label: `${item.name} (${item.unit})` }));
  if (wanted.has("team"))
    result.team = (
      await rows<{ name: string }>(
        db,
        "SELECT DISTINCT p.name FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=$1 AND p.status='active' ORDER BY p.name",
        [restaurant],
      )
    ).map((row) => ({ value: row.name, label: row.name }));
  if (wanted.has("segments"))
    result.segments = [...builtinSegments, ...(await customSegments(db, restaurant)).map((segment) => str(segment.data.name))]
      .filter(Boolean)
      .map((name) => ({ value: name, label: name }));
  return result;
}

/** Indicateurs de chaque outil : calculés côté serveur, jamais transmis par le client. */
async function insights(db: DB, restaurant: string, tool: TradeTool, list: TradeRecord[]): Promise<{ panels: TradePanel[]; extra?: unknown }> {
  const today = todayIso();
  switch (tool.id) {
    case "kitchen-display":
    case "service-pacing": {
      const settings = settingsOf(list);
      const target = n(settings.target) || 15;
      const station = settings.station === "Bar" ? "bar" : settings.station === "Tous" ? null : tool.id === "kitchen-display" ? "kitchen" : null;
      const open = await rows<{ order_id: string; label: string; channel: string; created_at: string; id: string; name: string; quantity: number; note: string; status: string; station: string }>(
        db,
        `SELECT o.id AS order_id,coalesce('Table '||t.number,nullif(o.customer_name,''),'Commande') AS label,o.channel,o.created_at,
            i.id,i.name,i.quantity,i.note,i.status,i.station
           FROM orders o JOIN order_items i ON i.order_id=o.id
           LEFT JOIN table_sessions s ON s.id=o.session_id LEFT JOIN dining_tables t ON t.id=s.table_id
          WHERE o.restaurant_id=$1 AND o.status IN ('pending','active') AND i.status IN ('waiting','preparing','ready')
            AND ($2::text IS NULL OR i.station=$2)
          ORDER BY o.created_at,i.id LIMIT 400`,
        [restaurant, station],
      );
      const tickets = new Map<string, { id: string; label: string; channel: string; createdAt: string; minutes: number; items: typeof open }>();
      for (const row of open) {
        const entry = tickets.get(row.order_id) ?? {
          id: row.order_id, label: row.label, channel: row.channel, createdAt: new Date(row.created_at).toISOString(),
          minutes: Math.floor((Date.now() - Date.parse(new Date(row.created_at).toISOString())) / 60_000), items: [],
        };
        entry.items.push(row);
        tickets.set(row.order_id, entry);
      }
      const all = [...tickets.values()];
      const pending = all.filter((ticket) => ticket.items.some((item) => item.status !== "ready"));
      const late = pending.filter((ticket) => ticket.minutes > target);
      const average = pending.length ? pending.reduce((sum, ticket) => sum + ticket.minutes, 0) / pending.length : 0;
      const kpis: TradePanel = { type: "kpis", items: [
        { label: "Bons en cours", value: String(pending.length) },
        { label: "En retard", value: String(late.length), hint: `au-delà de ${target} min`, tone: late.length ? "bad" : "good" },
        { label: "Attente moyenne", value: average < 60 ? `${Math.round(average)} min` : `${Math.floor(average / 60)} h ${String(Math.round(average) % 60).padStart(2, "0")}`, tone: average > target ? "warn" : "neutral" },
        { label: "Prêts à servir", value: String(all.filter((ticket) => ticket.items.every((item) => item.status === "ready")).length), tone: "good" },
      ] };
      if (tool.id === "kitchen-display") return { panels: [kpis], extra: { target, tickets: all } };
      const hours = await rows<{ hour: number; orders: number }>(
        db,
        `SELECT extract(hour FROM o.created_at AT TIME ZONE 'Europe/Paris')::int AS hour,count(*)::int AS orders
           FROM orders o WHERE o.restaurant_id=$1 AND (o.created_at AT TIME ZONE 'Europe/Paris')::date=$2::date AND o.status<>'cancelled'
          GROUP BY 1 ORDER BY 1`,
        [restaurant, today],
      );
      const top = await rows<{ name: string; quantity: number }>(
        db,
        `SELECT i.name,sum(i.quantity)::int AS quantity FROM orders o JOIN order_items i ON i.order_id=o.id
          WHERE o.restaurant_id=$1 AND (o.created_at AT TIME ZONE 'Europe/Paris')::date=$2::date AND i.status<>'cancelled'
          GROUP BY i.name ORDER BY 2 DESC LIMIT 8`,
        [restaurant, today],
      );
      const byStation = (name: string) => open.filter((item) => item.station === name && item.status !== "ready").reduce((sum, item) => sum + item.quantity, 0);
      return { panels: [
        kpis,
        { type: "bars", title: "Préparations en attente par poste", items: [
          { label: "Cuisine", value: byStation("kitchen"), display: String(byStation("kitchen")) },
          { label: "Bar", value: byStation("bar"), display: String(byStation("bar")) },
        ] },
        { type: "bars", title: "Commandes par heure aujourd’hui", items: hours.map((row) => ({ label: `${row.hour} h`, value: row.orders, display: String(row.orders) })), empty: "Aucune commande aujourd’hui pour le moment." },
        { type: "table", title: "Bons en retard", columns: ["Commande", "Attente", "Produits"], rows: late.map((ticket) => [ticket.label, ticket.minutes < 60 ? `${ticket.minutes} min` : `${Math.floor(ticket.minutes / 60)} h ${String(ticket.minutes % 60).padStart(2, "0")}`, ticket.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")]), empty: "Aucun retard : le service est dans les temps." },
        { type: "bars", title: "Plats les plus demandés aujourd’hui", items: top.map((row) => ({ label: row.name, value: row.quantity, display: String(row.quantity) })), empty: "Pas encore de plat servi aujourd’hui." },
      ] };
    }
    case "recipe-cost": {
      const target = n(settingsOf(list).target) || 30;
      const items = await menu(db, restaurant);
      const costed = items.filter((item) => item.cost !== null && item.price > 0);
      const ratio = (item: MenuRow) => ((item.cost ?? 0) / item.price) * 100;
      const over = costed.filter((item) => ratio(item) > target);
      const average = costed.length ? costed.reduce((sum, item) => sum + ratio(item), 0) / costed.length : 0;
      const simulations = byEntity(list, "simulation").map((record) => {
        const item = items.find((entry) => entry.id === record.data.product);
        const price = n(record.data.price);
        return [item?.name ?? "Produit retiré", euro(price), item?.cost != null && price > 0 ? pct((item.cost / price) * 100) : "—", item?.cost != null ? euro(price - item.cost) : "—"];
      });
      return { panels: [
        { type: "kpis", items: [
          { label: "Ratio matière moyen", value: pct(average), tone: average > target ? "warn" : "good", hint: `objectif ${pct(target)}` },
          { label: "Au-dessus de l’objectif", value: String(over.length), tone: over.length ? "bad" : "good" },
          { label: "Produits chiffrés", value: `${costed.length} / ${items.length}` },
          { label: "Sans fiche recette", value: String(items.length - costed.length), tone: items.length - costed.length ? "warn" : "good" },
        ] },
        { type: "table", title: "Coût matière par produit", columns: ["Produit", "Prix", "Coût matière", "Ratio", "Marge brute", "Prix conseillé"], rows: costed
          .toSorted((a, b) => ratio(b) - ratio(a))
          .map((item) => [item.name, euro(item.price), euro(item.cost ?? 0), pct(ratio(item)), euro(item.price - (item.cost ?? 0)), euro(Math.ceil((item.cost ?? 0) / (target / 100) / 10) * 10)]),
          empty: "Ajoutez des ingrédients à vos recettes (Gestion · Recettes) pour calculer les coûts." },
        { type: "table", title: "Simulations de prix", columns: ["Produit", "Prix testé", "Ratio", "Marge"], rows: simulations, empty: "Testez un nouveau prix avec « Ajouter une simulation »." },
      ] };
    }
    case "menu-allergens": {
      const items = await menu(db, restaurant);
      const matrix = items.map((item) => ({ id: item.id, name: item.name, raw: item.allergens, ...parseAllergens(item.allergens, allergenList) }));
      const filled = items.filter((item) => item.allergens.trim()).length;
      return { panels: [{ type: "kpis", items: [
        { label: "Produits renseignés", value: `${filled} / ${items.length}`, tone: filled === items.length ? "good" : "warn" },
        { label: "Avec au moins un allergène", value: String(matrix.filter((item) => item.present.length).length) },
        { label: "Avec traces possibles", value: String(matrix.filter((item) => item.traces.length).length) },
      ] }], extra: { allergens: allergenList, items: matrix } };
    }
    case "waste-tracker": {
      const stock = await ingredients(db, restaurant);
      const entries = byEntity(list, "waste").map((record) => {
        const item = stock.find((entry) => entry.id === record.data.ingredient);
        return { date: str(record.data.date), reason: str(record.data.reason), name: item?.name ?? "Ingrédient retiré", unit: item?.unit ?? "", cost: Math.round(n(record.data.quantity) * (item?.cost ?? 0) * 100) };
      });
      const month = entries.filter((entry) => str(entry.date) >= `${today.slice(0, 7)}-01`);
      const reasons = new Map<string, number>();
      for (const entry of month) reasons.set(str(entry.reason), (reasons.get(str(entry.reason)) ?? 0) + entry.cost);
      const top = new Map<string, number>();
      for (const entry of entries.filter((item) => daysAgo(str(item.date)) <= 30)) top.set(entry.name, (top.get(entry.name) ?? 0) + entry.cost);
      return { panels: [
        { type: "kpis", items: [
          { label: "Coût des pertes ce mois", value: euro(month.reduce((sum, entry) => sum + entry.cost, 0)), tone: month.length ? "warn" : "good" },
          { label: "Pertes saisies ce mois", value: String(month.length) },
          { label: "Cause principale", value: [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—" },
        ] },
        { type: "bars", title: "Coût par cause ce mois", items: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, display: euro(value) })), empty: "Aucune perte ce mois-ci." },
        { type: "bars", title: "Ingrédients les plus perdus (30 jours)", items: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value, display: euro(value), tone: "bad" as Tone })), empty: "Rien à signaler sur 30 jours." },
      ] };
    }
    case "site-planning": {
      const sites = byEntity(list, "site");
      const tasks = byEntity(list, "task");
      const late = tasks.filter((task) => task.data.status !== "Terminée" && str(task.data.end) < today);
      const done = tasks.filter((task) => task.data.status === "Terminée").length;
      return { panels: [
        { type: "kpis", items: [
          { label: "Chantiers en cours", value: String(sites.filter((site) => site.data.status === "En cours").length) },
          { label: "Étapes en retard", value: String(late.length), tone: late.length ? "bad" : "good" },
          { label: "Avancement global", value: tasks.length ? pct((done / tasks.length) * 100) : "—" },
          { label: "Étapes cette semaine", value: String(tasks.filter((task) => str(task.data.start) <= today && str(task.data.end) >= today).length) },
        ] },
        { type: "timeline", title: "Frise des étapes", items: tasks
          .map((task) => ({
            label: str(task.data.title), group: str(sites.find((site) => site.id === task.data.site)?.data.name) || "Chantier retiré",
            start: str(task.data.start), end: str(task.data.end),
            tone: (task.data.status === "Terminée" ? "good" : str(task.data.end) < today ? "bad" : task.data.status === "En cours" ? "warn" : "neutral") as Tone,
          }))
          .sort((a, b) => a.group.localeCompare(b.group) || a.start.localeCompare(b.start)), empty: "Ajoutez un chantier puis ses étapes pour voir la frise." },
        { type: "table", title: "Avancement par chantier", columns: ["Chantier", "Client", "Statut", "Étapes terminées", "En retard", "Fin prévue"], rows: sites.map((site) => {
          const own = tasks.filter((task) => task.data.site === site.id);
          return [str(site.data.name), str(site.data.client) || "—", str(site.data.status), `${own.filter((task) => task.data.status === "Terminée").length} / ${own.length}`, String(own.filter((task) => late.includes(task)).length), day(str(site.data.end))];
        }), empty: "Aucun chantier pour le moment." },
      ] };
    }
    case "site-report": {
      const reports = byEntity(list, "report").toSorted((a, b) => str(b.data.date).localeCompare(str(a.data.date)));
      const latest = new Map<string, TradeRecord>();
      for (const report of reports) if (!latest.has(str(report.data.site))) latest.set(str(report.data.site), report);
      const recent = reports.filter((report) => daysAgo(str(report.data.date)) <= 30);
      return { panels: [
        { type: "kpis", items: [
          { label: "Rapports sur 30 jours", value: String(recent.length) },
          { label: "Chantiers suivis", value: String(latest.size) },
          { label: "Réserves ouvertes", value: String([...latest.values()].filter((report) => report.data.reservesOpen === true).length), tone: [...latest.values()].some((report) => report.data.reservesOpen === true) ? "warn" : "good" },
          { label: "Effectif moyen", value: recent.length ? num(recent.reduce((sum, report) => sum + n(report.data.workforce), 0) / recent.length) : "—" },
        ] },
        { type: "bars", title: "Dernier avancement par chantier", items: [...latest.values()].map((report) => ({ label: str(report.data.site), value: n(report.data.progress), display: pct(n(report.data.progress)), tone: (n(report.data.progress) >= 100 ? "good" : "neutral") as Tone })), empty: "Rédigez un premier rapport de chantier." },
        { type: "table", title: "Réserves à lever", columns: ["Chantier", "Rapport du", "Réserves"], rows: [...latest.values()].filter((report) => report.data.reservesOpen === true).map((report) => [str(report.data.site), day(str(report.data.date)), str(report.data.reserves) || "—"]), empty: "Aucune réserve ouverte." },
      ] };
    }
    case "quote-builder": {
      const quotes = byEntity(list, "quote").map((record) => ({ record, totals: quoteTotals((record.data.lines as QuoteLine[]) ?? []) }));
      const sum = (statusName: string) => quotes.filter((quote) => quote.record.data.status === statusName).reduce((total, quote) => total + quote.totals.net, 0);
      const decided = quotes.filter((quote) => ["Accepté", "Refusé"].includes(str(quote.record.data.status)));
      return { panels: [{ type: "kpis", items: [
        { label: "Devis envoyés en attente", value: euro(sum("Envoyé")), hint: "montant HT" },
        { label: "Devis acceptés", value: euro(sum("Accepté")), tone: "good", hint: "montant HT" },
        { label: "Taux d’acceptation", value: decided.length ? pct((decided.filter((quote) => quote.record.data.status === "Accepté").length / decided.length) * 100) : "—" },
        { label: "Brouillons", value: String(quotes.filter((quote) => quote.record.data.status === "Brouillon").length) },
      ] }], extra: { totals: Object.fromEntries(quotes.map((quote) => [quote.record.id, quote.totals])) } };
    }
    case "equipment-log": {
      const equipment = byEntity(list, "equipment");
      const events = byEntity(list, "event");
      const soon = new Date(Date.now() + 14 * 86_400_000).toLocaleDateString("sv-SE");
      const due = equipment.filter((item) => str(item.data.nextService) && str(item.data.nextService) <= soon && item.data.status !== "Hors service");
      const year = events.filter((event) => str(event.data.date).startsWith(today.slice(0, 4)) && ["Entretien", "Réparation", "Panne"].includes(str(event.data.type)));
      return { panels: [
        { type: "kpis", items: [
          { label: "Matériel", value: String(equipment.length) },
          { label: "Affecté", value: String(equipment.filter((item) => item.data.status === "Affecté").length) },
          { label: "Entretien sous 14 jours", value: String(due.length), tone: due.length ? "warn" : "good" },
          { label: "Coût d’entretien de l’année", value: euro(year.reduce((total, event) => total + n(event.data.cost), 0)) },
        ] },
        { type: "table", title: "Entretiens à prévoir", columns: ["Matériel", "Statut", "Affecté à", "Échéance"], rows: due.toSorted((a, b) => str(a.data.nextService).localeCompare(str(b.data.nextService))).map((item) => [str(item.data.name), str(item.data.status), str(item.data.assignedTo) || "—", `${day(str(item.data.nextService))}${str(item.data.nextService) < today ? " · dépassé" : ""}`]), empty: "Aucun entretien à prévoir dans les 14 jours." },
        { type: "bars", title: "Répartition par statut", items: ["Disponible", "Affecté", "En entretien", "Hors service"].map((label) => {
          const value = equipment.filter((item) => item.data.status === label).length;
          return { label, value, display: String(value), tone: (label === "Hors service" ? "bad" : label === "En entretien" ? "warn" : "neutral") as Tone };
        }) },
      ] };
    }
    case "appointment-booking": {
      const services = byEntity(list, "service");
      const appointments = byEntity(list, "appointment").map((record) => {
        const service = services.find((entry) => entry.id === record.data.service);
        const start = Date.parse(str(record.data.start));
        const minutes = n(service?.data.duration) || 30;
        return { id: record.id, client: str(record.data.client), phone: str(record.data.phone), staff: str(record.data.staff) || "Sans collaborateur", chair: n(record.data.chair) || null, status: str(record.data.status), service: str(service?.data.name) || "Prestation retirée", price: n(service?.data.price), start: new Date(start).toISOString(), minutes, conflict: false };
      });
      const active = appointments.filter((entry) => !["Annulé", "Absent"].includes(entry.status));
      for (const entry of active)
        entry.conflict = active.some((other) => other !== entry && other.staff === entry.staff && entry.staff !== "Sans collaborateur" && overlaps(Date.parse(entry.start), entry.minutes, Date.parse(other.start), other.minutes));
      const isToday = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) === today;
      const todays = active.filter((entry) => isToday(entry.start));
      return { panels: [{ type: "kpis", items: [
        { label: "Rendez-vous aujourd’hui", value: String(todays.length) },
        { label: "Chiffre d’affaires prévu", value: euro(todays.reduce((total, entry) => total + entry.price, 0)), tone: "good" },
        { label: "Chevauchements", value: String(active.filter((entry) => entry.conflict).length), tone: active.some((entry) => entry.conflict) ? "bad" : "good" },
        { label: "Absences sur 30 jours", value: String(appointments.filter((entry) => entry.status === "Absent" && daysAgo(entry.start) <= 30 && daysAgo(entry.start) >= 0).length) },
      ] }], extra: { appointments, today } };
    }
    case "chair-occupancy": {
      const settings = settingsOf(list);
      const chairs = n(settings.chairs) || 3;
      const open = n(settings.open) || 9;
      const close = n(settings.close) || 19;
      if (!(await installed(db, restaurant, "appointment-booking")))
        return { panels: [{ type: "note", tone: "warn", text: "Installez l’add-on « Agenda de rendez-vous » : l’occupation se calcule à partir de ses rendez-vous." }] };
      const agenda = await rows<TradeRecord>(db, "SELECT id,entity,data,created_at,updated_at FROM trade_records WHERE restaurant_id=$1 AND tool_id='appointment-booking' AND archived_at IS NULL", [restaurant]);
      const services = byEntity(agenda, "service");
      const slots = byEntity(agenda, "appointment")
        .filter((record) => !["Annulé", "Absent"].includes(str(record.data.status)))
        .map((record) => ({ start: Date.parse(str(record.data.start)), minutes: n(services.find((service) => service.id === record.data.service)?.data.duration) || 30 }));
      const hourLoad = (date: string, hour: number) => {
        const from = parisTime(date, hour);
        const to = from + 3_600_000;
        return slots.reduce((total, slot) => total + Math.max(0, Math.min(to, slot.start + slot.minutes * 60_000) - Math.max(from, slot.start)), 0) / 60_000;
      };
      const hours = Array.from({ length: Math.max(0, close - open) }, (_, index) => open + index);
      const capacity = chairs * 60;
      const todayLoad = hours.map((hour) => ({ hour, rate: Math.min(100, (hourLoad(today, hour) / capacity) * 100) }));
      const week = Array.from({ length: 7 }, (_, offset) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }));
      const weekRates = week.map((date) => ({ date, rate: hours.length ? (hours.reduce((total, hour) => total + hourLoad(date, hour), 0) / (capacity * hours.length)) * 100 : 0 }));
      const dayRate = todayLoad.length ? todayLoad.reduce((total, entry) => total + entry.rate, 0) / todayLoad.length : 0;
      return { panels: [
        { type: "kpis", items: [
          { label: "Occupation aujourd’hui", value: pct(dayRate), tone: dayRate >= 70 ? "good" : dayRate >= 40 ? "warn" : "bad" },
          { label: "Occupation sur 7 jours", value: pct(weekRates.reduce((total, entry) => total + entry.rate, 0) / 7) },
          { label: "Heures creuses aujourd’hui", value: String(todayLoad.filter((entry) => entry.rate < 30).length), hint: "moins de 30 %" },
          { label: "Fauteuils", value: String(chairs), hint: `${open} h – ${close} h` },
        ] },
        { type: "bars", title: "Charge heure par heure aujourd’hui", items: todayLoad.map((entry) => ({ label: `${entry.hour} h`, value: entry.rate, display: pct(entry.rate), tone: (entry.rate < 30 ? "bad" : entry.rate < 70 ? "warn" : "good") as Tone })) },
        { type: "bars", title: "Occupation des 7 prochains jours", items: weekRates.map((entry) => ({ label: day(entry.date), value: entry.rate, display: pct(entry.rate) })) },
      ] };
    }
    case "client-style": {
      const sheets = byEntity(list, "sheet");
      const visits = byEntity(list, "visit");
      const last = (id: string) => visits.filter((visit) => visit.data.sheet === id).map((visit) => str(visit.data.date)).sort().at(-1) ?? null;
      const recent = visits.filter((visit) => daysAgo(str(visit.data.date)) <= 30);
      const toCall = sheets.filter((sheet) => {
        const date = last(sheet.id);
        return date !== null && daysAgo(date) > 60;
      });
      return { panels: [
        { type: "kpis", items: [
          { label: "Fiches clients", value: String(sheets.length) },
          { label: "Visites sur 30 jours", value: String(recent.length) },
          { label: "Panier moyen", value: recent.length ? euro(Math.round(recent.reduce((total, visit) => total + n(visit.data.amount), 0) / recent.length)) : "—" },
          { label: "À relancer", value: String(toCall.length), tone: toCall.length ? "warn" : "good", hint: "plus de 60 jours" },
        ] },
        { type: "table", title: "Clients à relancer", columns: ["Client", "Téléphone", "Dernière visite", "Formule"], rows: toCall.map((sheet) => [str(sheet.data.client), str(sheet.data.phone) || "—", day(last(sheet.id)), str(sheet.data.formula) || "—"]), empty: "Tous vos clients sont venus ces 60 derniers jours." },
        { type: "table", title: "Derniers passages", columns: ["Date", "Client", "Prestation", "Formule", "Montant"], rows: visits.toSorted((a, b) => str(b.data.date).localeCompare(str(a.data.date))).slice(0, 15).map((visit) => [day(str(visit.data.date)), str(sheets.find((sheet) => sheet.id === visit.data.sheet)?.data.client) || "—", str(visit.data.service), str(visit.data.formula) || "—", n(visit.data.amount) ? euro(n(visit.data.amount)) : "—"]), empty: "Aucune visite enregistrée." },
      ] };
    }
    case "salon-stock": {
      const products = byEntity(list, "product");
      const movements = byEntity(list, "movement");
      const level = (id: string, initial: number) =>
        movements.filter((movement) => movement.data.product === id).reduce((total, movement) => total + (movement.data.type === "Entrée" ? 1 : -1) * n(movement.data.quantity), initial);
      const levels = products.map((product) => ({ product, quantity: level(product.id, n(product.data.initial)) }));
      const low = levels.filter((entry) => entry.quantity <= n(entry.product.data.threshold));
      const sales = movements.filter((movement) => movement.data.type === "Vente" && daysAgo(str(movement.data.date)) <= 30);
      const margin = sales.reduce((total, movement) => {
        const product = products.find((entry) => entry.id === movement.data.product);
        return total + n(movement.data.quantity) * (n(product?.data.price) - n(product?.data.cost));
      }, 0);
      return { panels: [
        { type: "kpis", items: [
          { label: "Produits suivis", value: String(products.length) },
          { label: "Sous le seuil", value: String(low.length), tone: low.length ? "bad" : "good" },
          { label: "Valeur du stock", value: euro(levels.reduce((total, entry) => total + Math.max(0, entry.quantity) * n(entry.product.data.cost), 0)) },
          { label: "Marge revente (30 j)", value: euro(margin), tone: "good" },
        ] },
        { type: "table", title: "À commander", columns: ["Produit", "Marque", "Usage", "En stock", "Seuil"], rows: low.map((entry) => [str(entry.product.data.name), str(entry.product.data.brand) || "—", str(entry.product.data.usage), num(entry.quantity), num(n(entry.product.data.threshold))]), empty: "Aucun produit sous son seuil." },
        { type: "bars", title: "Niveau de stock", items: levels.map((entry) => ({ label: str(entry.product.data.name), value: Math.max(0, entry.quantity), display: num(entry.quantity), tone: (entry.quantity <= n(entry.product.data.threshold) ? "bad" : "good") as Tone })), empty: "Ajoutez vos produits pour suivre leur stock." },
      ] };
    }
    case "product-variants": {
      const items = await menu(db, restaurant);
      const variants = byEntity(list, "variant");
      return { panels: [
        { type: "kpis", items: [
          { label: "Variantes", value: String(variants.length) },
          { label: "Produits déclinés", value: String(new Set(variants.map((variant) => variant.data.product)).size) },
          { label: "En rupture", value: String(variants.filter((variant) => n(variant.data.stock) === 0).length), tone: variants.some((variant) => n(variant.data.stock) === 0) ? "bad" : "good" },
          { label: "Unités en stock", value: num(variants.reduce((total, variant) => total + n(variant.data.stock), 0)) },
        ] },
        { type: "table", title: "Déclinaisons et prix final", columns: ["Produit", "Option", "Valeur", "Référence", "Prix final", "Stock"], rows: variants.map((variant) => {
          const item = items.find((entry) => entry.id === variant.data.product);
          return [item?.name ?? "Produit retiré", str(variant.data.option), str(variant.data.value), str(variant.data.sku) || "—", euro((item?.price ?? 0) + n(variant.data.delta)), n(variant.data.stock) === 0 ? "Rupture" : num(n(variant.data.stock))];
        }), empty: "Ajoutez une première variante à un produit de votre catalogue." },
      ] };
    }
    case "abandoned-cart": {
      const carts = await rows<{ number: number; created_at: string; customer_name: string; contact: string; total: number }>(
        db,
        `SELECT s.number,o.created_at,o.customer_name,o.contact,s.total FROM shop_orders s JOIN orders o ON o.id=s.order_id
          WHERE o.restaurant_id=$1 AND s.payment_method='stripe' AND s.payment_status='unpaid' AND o.status<>'cancelled'
            AND o.created_at < now()-interval '30 minutes' AND o.created_at > now()-interval '30 days'
          ORDER BY o.created_at DESC LIMIT 200`,
        [restaurant],
      );
      const followups = byEntity(list, "followup");
      const recovered = followups.filter((followup) => followup.data.outcome === "Récupéré");
      return { panels: [
        { type: "kpis", items: [
          { label: "Paiements non finalisés (30 j)", value: String(carts.length), tone: carts.length ? "warn" : "good" },
          { label: "Montant en jeu", value: euro(carts.reduce((total, cart) => total + cart.total, 0)) },
          { label: "Relances", value: String(followups.length) },
          { label: "Ventes récupérées", value: String(recovered.length), tone: recovered.length ? "good" : "neutral" },
        ] },
        { type: "table", title: "Commandes à relancer", columns: ["N°", "Date", "Client", "Contact", "Montant", "Relance"], rows: carts.map((cart) => {
          const done = followups.find((followup) => followup.data.order === String(cart.number));
          return [String(cart.number), day(new Date(cart.created_at).toISOString()), cart.customer_name || "—", cart.contact || "—", euro(cart.total), done ? `${str(done.data.outcome)} · ${str(done.data.channel)}` : "À relancer"];
        }), empty: "Aucun paiement en ligne abandonné ces 30 derniers jours." },
      ] };
    }
    case "shipping-rules": {
      const zones = byEntity(list, "zone");
      const prefixes = new Map<string, string[]>();
      for (const zone of zones)
        for (const prefix of str(zone.data.postcodes).split(",").map((entry) => entry.trim()).filter(Boolean))
          prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), str(zone.data.name)]);
      const duplicates = [...prefixes.entries()].filter(([, names]) => names.length > 1);
      return { panels: [
        { type: "kpis", items: [
          { label: "Zones", value: String(zones.length) },
          { label: "Préfixes couverts", value: String(prefixes.size) },
          { label: "Conflits de zones", value: String(duplicates.length), tone: duplicates.length ? "bad" : "good" },
        ] },
        { type: "table", title: "Codes postaux en double", columns: ["Préfixe", "Zones concernées"], rows: duplicates.map(([prefix, names]) => [prefix, names.join(", ")]), empty: "Aucun conflit : chaque code postal mène à une seule zone." },
      ], extra: { zones: zones.map((zone) => zone.data) } };
    }
    case "product-bundles": {
      const items = await menu(db, restaurant);
      const bundles = byEntity(list, "bundle").map((record) => {
        const parts = ((record.data.items as string[]) ?? []).map((id) => items.find((item) => item.id === id)).filter((item): item is MenuRow => !!item);
        const value = parts.reduce((total, part) => total + part.price, 0);
        const cost = parts.every((part) => part.cost !== null) ? parts.reduce((total, part) => total + (part.cost ?? 0), 0) : null;
        const price = n(record.data.price);
        return { record, parts, value, cost, price, discount: value > 0 ? ((value - price) / value) * 100 : 0 };
      });
      return { panels: [
        { type: "kpis", items: [
          { label: "Lots actifs", value: String(bundles.filter((bundle) => bundle.record.data.status === "Actif").length) },
          { label: "Remise moyenne", value: bundles.length ? pct(bundles.reduce((total, bundle) => total + bundle.discount, 0) / bundles.length) : "—" },
          { label: "Lots sous le coût", value: String(bundles.filter((bundle) => bundle.cost !== null && bundle.price < bundle.cost).length), tone: bundles.some((bundle) => bundle.cost !== null && bundle.price < bundle.cost) ? "bad" : "good" },
        ] },
        { type: "table", title: "Composition et rentabilité", columns: ["Lot", "Produits", "Valeur séparée", "Prix du lot", "Remise", "Marge"], rows: bundles.map((bundle) => [str(bundle.record.data.name), bundle.parts.map((part) => part.name).join(" + ") || "—", euro(bundle.value), euro(bundle.price), pct(bundle.discount), bundle.cost === null ? "Coût inconnu" : euro(bundle.price - bundle.cost)]), empty: "Composez un premier lot à partir de votre catalogue." },
      ] };
    }
    case "customer-segments": {
      const stats = await customerStats(db, restaurant);
      const segments = byEntity(list, "segment");
      const names = [...builtinSegments, ...segments.map((segment) => str(segment.data.name))];
      const members = Object.fromEntries(names.map((name) => [name, segmentMembers(stats, segments, name).slice(0, 300).map((customer) => ({ name: customer.name, contact: customer.contact, orders: customer.orders, spend: customer.spend, lastOrder: customer.lastOrder }))]));
      return { panels: [
        { type: "kpis", items: [
          { label: "Clients", value: String(stats.length) },
          { label: "Fidèles", value: String(members["Fidèles"].length), tone: "good" },
          { label: "À risque", value: String(members["À risque"].length), tone: members["À risque"].length ? "warn" : "good" },
          { label: "Inactifs", value: String(members["Inactifs"].length), tone: members["Inactifs"].length ? "bad" : "good" },
        ] },
        { type: "bars", title: "Répartition automatique", items: builtinSegments.map((name) => ({ label: name, value: members[name].length, display: String(members[name].length) })) },
        { type: "table", title: "Segments sur mesure", columns: ["Segment", "Clients"], rows: segments.map((segment) => [str(segment.data.name), String(members[str(segment.data.name)]?.length ?? 0)]), empty: "Créez un segment sur mesure (par exemple : 5 commandes et plus)." },
      ], extra: { members } };
    }
    case "loyalty-campaigns": {
      const stats = await customerStats(db, restaurant);
      const segments = await customSegments(db, restaurant);
      const campaigns = byEntity(list, "campaign").map((record) => ({
        record,
        reach: segmentMembers(stats, segments, str(record.data.segment)).length,
        phase: str(record.data.end) < today ? "Terminée" : str(record.data.start) > today ? "À venir" : "En cours",
      }));
      return { panels: [
        { type: "kpis", items: [
          { label: "Campagnes en cours", value: String(campaigns.filter((campaign) => campaign.phase === "En cours").length), tone: "good" },
          { label: "À venir", value: String(campaigns.filter((campaign) => campaign.phase === "À venir").length) },
          { label: "Clients touchés (en cours)", value: String(campaigns.filter((campaign) => campaign.phase === "En cours").reduce((total, campaign) => total + campaign.reach, 0)) },
          { label: "Clients joignables", value: String(stats.filter((customer) => customer.contact).length) },
        ] },
        { type: "table", title: "Calendrier des campagnes", columns: ["Campagne", "Segment", "Offre", "Canal", "Période", "Portée", "Phase"], rows: campaigns.map((campaign) => [str(campaign.record.data.name), str(campaign.record.data.segment), `${str(campaign.record.data.offer)}${campaign.record.data.value ? ` · ${num(n(campaign.record.data.value))}` : ""}`, str(campaign.record.data.channel), `${day(str(campaign.record.data.start))} → ${day(str(campaign.record.data.end))}`, `${campaign.reach} clients`, campaign.phase]), empty: "Planifiez votre première campagne." },
      ] };
    }
    case "conversion-insights": {
      const pages = await rows<{ path: string; views: number }>(
        db,
        "SELECT path,sum(pageviews)::int AS views FROM analytics_pages_daily WHERE restaurant_id=$1 AND day>current_date-30 GROUP BY path ORDER BY 2 DESC LIMIT 50",
        [restaurant],
      ).catch(() => []);
      const visits = pages.reduce((total, page) => total + page.views, 0);
      const intent = pages.filter((page) => /boutique|menu|carte|commande|reserv|shop|estimation/i.test(page.path)).reduce((total, page) => total + page.views, 0);
      const counts = await one<{ online: number; reservations: number; revenue: number }>(
        db,
        `SELECT (SELECT count(*)::int FROM shop_orders s JOIN orders o ON o.id=s.order_id WHERE o.restaurant_id=$1 AND o.created_at>now()-interval '30 days' AND o.status<>'cancelled') AS online,
                (SELECT count(*)::int FROM reservations r WHERE r.restaurant_id=$1 AND r.starts_at>now()-interval '30 days' AND r.starts_at<=now()+interval '60 days') AS reservations,
                (SELECT coalesce(sum(s.total),0)::int FROM shop_orders s JOIN orders o ON o.id=s.order_id WHERE o.restaurant_id=$1 AND o.created_at>now()-interval '30 days' AND s.payment_status='paid') AS revenue`,
        [restaurant],
      );
      const converted = counts.online + counts.reservations;
      const panels: TradePanel[] = [
        { type: "kpis", items: [
          { label: "Pages vues (30 j)", value: num(visits) },
          { label: "Commandes en ligne", value: String(counts.online) },
          { label: "Réservations", value: String(counts.reservations) },
          { label: "Taux de conversion", value: visits ? pct((converted / visits) * 100) : "—", tone: visits && converted / visits >= 0.02 ? "good" : "warn", hint: "actions / pages vues" },
        ] },
        { type: "bars", title: "Entonnoir sur 30 jours", items: [
          { label: "Pages vues", value: visits, display: num(visits) },
          { label: "Pages carte, boutique, réservation", value: intent, display: num(intent) },
          { label: "Commandes et réservations", value: converted, display: num(converted), tone: "good" },
        ] },
        { type: "table", title: "Pages les plus vues", columns: ["Page", "Vues"], rows: pages.slice(0, 10).map((page) => [page.path, num(page.views)]), empty: "Aucune visite mesurée." },
        { type: "kpis", items: [{ label: "Chiffre encaissé en ligne (30 j)", value: euro(counts.revenue), tone: "good" }] },
      ];
      if (!visits) panels.unshift({ type: "note", tone: "warn", text: "Les visites proviennent de la mesure d’audience du site (add-on Earth Tracker). Sans elle, seules les commandes et réservations sont comptées." });
      return { panels };
    }
  }
  return { panels: [] };
}

/** Outils installés et accessibles au profil, pour le menu « Outils métier ». */
export const tradeOverview = (restaurant: string) =>
  authenticated(restaurant, async (db, user) => {
    const scoped = await scope(db, user, restaurant);
    const installedIds = (
      await rows<{ id: string }>(
        db,
        "SELECT p.id FROM addon_products p WHERE p.kind='business' AND app.addon_installed($1,p.id) ORDER BY p.position",
        [restaurant],
      )
    ).map((row) => row.id);
    return {
      tools: tradeTools
        .filter((tool) => installedIds.includes(tool.id) && allowed(scoped, tool))
        .map((tool) => ({ id: tool.id, name: tool.name, industry: tool.industry, tagline: tool.tagline })),
    };
  });

/** Corps testable : le contexte d’établissement et le profil sont déjà établis. */
export async function tradeStateOn(db: DB, restaurant: string, scoped: Scoped, id: string) {
  const tool = await access(db, restaurant, scoped, id);
  const list = await records(db, restaurant, tool.id);
  return { tool: tool.id, records: list, sources: await sources(db, restaurant, tool), ...(await insights(db, restaurant, tool, list)) };
}
export const tradeState = (restaurant: string, id: string) =>
  authenticated(restaurant, async (db, user) => tradeStateOn(db, restaurant, await scope(db, user, restaurant), id));

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), entity: z.string().max(32), data: z.unknown() }),
  z.object({ action: z.literal("update"), entity: z.string().max(32), id: z.string().uuid(), data: z.unknown() }),
  z.object({ action: z.literal("archive"), id: z.string().uuid() }),
  z.object({ action: z.literal("allergens"), menuId: z.string(), present: z.array(z.string()), traces: z.array(z.string()) }),
]);
async function validateRefs(db: DB, restaurant: string, tool: TradeTool, entity: TradeEntity, data: Record<string, unknown>) {
  const options = await sources(db, restaurant, tool);
  for (const field of entity.fields) {
    const value = data[field.key];
    if (value === undefined) continue;
    if (field.type === "ref") {
      const found = await rows(db,
        "SELECT 1 FROM trade_records WHERE id=$1 AND restaurant_id=$2 AND tool_id=$3 AND entity=$4 AND archived_at IS NULL",
        [value, restaurant, tool.id, field.ref]);
      if (!found.length) throw new Error(`« ${field.label} » ne correspond à aucune fiche.`);
    }
    if (field.source) {
      const allowedValues = new Set((options[field.source] ?? []).map((option) => option.value));
      const values = Array.isArray(value) ? value : [value];
      if (values.some((entry) => !allowedValues.has(String(entry)))) throw new Error(`« ${field.label} » contient un choix inconnu.`);
    }
  }
}
export async function tradePerform(restaurant: string, id: string, raw: unknown) {
  return authenticated(restaurant, async (db, user) => tradePerformOn(db, restaurant, await scope(db, user, restaurant), id, raw));
}
export async function tradePerformOn(db: DB, restaurant: string, scoped: Scoped, id: string, raw: unknown) {
  const body = actionSchema.parse(raw);
  const user = scoped;
  {
    const tool = await access(db, restaurant, scoped, id);
    if (body.action === "allergens") {
      if (tool.id !== "menu-allergens") throw new Error("Action indisponible pour cet outil.");
      const value = allergenSchema.parse({ menuId: body.menuId, present: body.present, traces: body.traces });
      const known = (list: string[]) => list.filter((entry) => (allergenList as readonly string[]).includes(entry));
      const present = known(value.present);
      const traces = known(value.traces).filter((entry) => !present.includes(entry));
      const updated = await rows(db, "UPDATE menu_items SET allergens=$3 WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL RETURNING id", [value.menuId, restaurant, formatAllergens(present, traces)]);
      if (!updated.length) throw new Error("Produit introuvable dans cet établissement.");
      await log(db, restaurant, user.id, "Allergènes mis à jour", value.menuId);
    } else if (body.action === "archive") {
      const result = await rows(db, "UPDATE trade_records SET archived_at=now() WHERE id=$1 AND restaurant_id=$2 AND tool_id=$3 AND archived_at IS NULL RETURNING id", [body.id, restaurant, tool.id]);
      if (!result.length) throw new Error("Fiche introuvable.");
      await log(db, restaurant, user.id, `${tool.name} : fiche supprimée`, body.id);
    } else {
      const entity = tool.entities.find((entry) => entry.id === body.entity);
      if (!entity) throw new Error("Type de fiche inconnu.");
      const data = parseTradeData(entity, body.data);
      await validateRefs(db, restaurant, tool, entity, data);
      if (body.action === "create") {
        if (entity.singleton) {
          const existing = await rows<{ id: string }>(db, "SELECT id FROM trade_records WHERE restaurant_id=$1 AND tool_id=$2 AND entity=$3 AND archived_at IS NULL", [restaurant, tool.id, entity.id]);
          if (existing.length) throw new Error("Ces réglages existent déjà : modifiez-les.");
        }
        await db.query("INSERT INTO trade_records(restaurant_id,tool_id,entity,data,created_by) VALUES($1,$2,$3,$4::jsonb,$5)", [restaurant, tool.id, entity.id, JSON.stringify(data), user.id]);
        await log(db, restaurant, user.id, `${tool.name} : fiche ajoutée (${entity.label.toLowerCase()})`, tool.id);
      } else {
        const result = await rows(db, "UPDATE trade_records SET data=$5::jsonb WHERE id=$1 AND restaurant_id=$2 AND tool_id=$3 AND entity=$4 AND archived_at IS NULL RETURNING id", [body.id, restaurant, tool.id, entity.id, JSON.stringify(data)]);
        if (!result.length) throw new Error("Fiche introuvable.");
        await log(db, restaurant, user.id, `${tool.name} : fiche modifiée (${entity.label.toLowerCase()})`, body.id);
      }
    }
    return tradeStateOn(db, restaurant, scoped, tool.id);
  }
}

/** Chiffres des outils métier repris par la vue d'ensemble (outils installés et permis seulement). */
export type TradePilotage = {
  agenda?: { today: number; upcoming: { client: string; service: string; start: string; status: string }[] };
  sites?: { active: number };
  quotes?: { pending: number };
  reports?: { reservesOpen: number };
  equipment?: { due: number };
  salonStock?: { low: number };
  followups?: { week: number };
};
export async function tradePilotage(
  db: DB,
  restaurant: string,
  user: { role: Scoped["role"]; roles?: Scoped["roles"] },
): Promise<TradePilotage> {
  const open = async (id: string) => {
    const tool = isTradeTool(id) ? tradeTool(id) : undefined;
    if (!tool || (tool.permission !== null && !can(user.roles ?? user.role, tool.permission))) return null;
    if (!(await installed(db, restaurant, id))) return null;
    return records(db, restaurant, id);
  };
  const today = todayIso();
  const summary: TradePilotage = {};
  const agenda = await open("appointment-booking");
  if (agenda) {
    const services = byEntity(agenda, "service");
    const live = byEntity(agenda, "appointment").filter((record) => !["Annulé", "Absent"].includes(str(record.data.status)));
    const dayOf = (value: string) => new Date(value).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const now = Date.now();
    summary.agenda = {
      today: live.filter((record) => dayOf(str(record.data.start)) === today).length,
      upcoming: live
        .filter((record) => Date.parse(str(record.data.start)) >= now - 3_600_000 && str(record.data.status) !== "Terminé")
        .sort((a, b) => Date.parse(str(a.data.start)) - Date.parse(str(b.data.start)))
        .slice(0, 4)
        .map((record) => ({
          client: str(record.data.client),
          service: str(services.find((service) => service.id === record.data.service)?.data.name),
          start: str(record.data.start),
          status: str(record.data.status),
        })),
    };
  }
  const sites = await open("site-planning");
  if (sites)
    summary.sites = {
      active: byEntity(sites, "site").filter((record) => {
        const start = str(record.data.start), end = str(record.data.end);
        return record.data.status !== "Terminé" && (!start || start <= today) && (!end || end >= today);
      }).length,
    };
  const quotes = await open("quote-builder");
  if (quotes) summary.quotes = { pending: byEntity(quotes, "quote").filter((record) => record.data.status === "Envoyé").length };
  const reports = await open("site-report");
  if (reports) {
    // Seul le dernier rapport de chaque chantier dit si des réserves restent ouvertes.
    const latest = new Map<string, TradeRecord>();
    for (const record of byEntity(reports, "report")) {
      const site = str(record.data.site).trim().toLowerCase();
      const known = latest.get(site);
      if (!known || str(record.data.date) > str(known.data.date)) latest.set(site, record);
    }
    summary.reports = { reservesOpen: [...latest.values()].filter((record) => record.data.reservesOpen === true).length };
  }
  const equipment = await open("equipment-log");
  if (equipment) {
    const limit = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    summary.equipment = {
      due: byEntity(equipment, "equipment").filter((record) => {
        const next = str(record.data.nextService);
        return next !== "" && next <= limit;
      }).length,
    };
  }
  const salon = await open("salon-stock");
  if (salon) {
    const movements = byEntity(salon, "movement");
    summary.salonStock = {
      low: byEntity(salon, "product").filter((product) => {
        const level = movements
          .filter((movement) => movement.data.product === product.id)
          .reduce((total, movement) => total + (movement.data.type === "Entrée" ? 1 : -1) * n(movement.data.quantity), n(product.data.initial));
        return level <= n(product.data.threshold);
      }).length,
    };
  }
  const carts = await open("abandoned-cart");
  if (carts) summary.followups = { week: byEntity(carts, "followup").filter((record) => daysAgo(str(record.data.date)) <= 7).length };
  return summary;
}
