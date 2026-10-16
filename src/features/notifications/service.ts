import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { permissionsOf } from "@/lib/permissions";
import { emit } from "@/features/events/service";
import { notificationRetentionDays } from "@/features/events/categories";
import {
  alertSettings,
  isNotificationType,
  notificationCatalog,
} from "./catalog";
import type { Notice } from "@/lib/types";
export const notificationActionSchemas = [
  z.object({ action: z.literal("read"), id: z.string().min(1).optional() }),
  z.object({
    action: z.literal("notificationPreference"),
    type: z.string().min(1).max(60),
    muted: z.boolean(),
  }),
] as const;
/**
 * Filtre serveur de visibilité ($1 établissement, $2 profil, $3 permissions
 * effectives) : 7 derniers jours (au-delà : historique), destinataire,
 * permissions, préférences, hors actions du profil lui-même (elles restent
 * dans l’historique). Le critique ignore les mises en sourdine.
 */
const visible = `n.restaurant_id=$1
 AND n.created_at>now()-interval '${notificationRetentionDays} days'
 AND (n.recipient IS NULL OR n.recipient=$2)
 AND NOT EXISTS(SELECT 1 FROM domain_events ev WHERE ev.id=n.event_id AND ev.actor=$2)
 AND (n.permissions IS NULL OR n.permissions && $3::text[])
 AND (n.priority='critical' OR NOT EXISTS(SELECT 1 FROM notification_preferences np WHERE np.profile_id=$2 AND np.restaurant_id=$1 AND np.type=n.type AND np.muted))`;
const params = (r: string, user: Actor) => [r, user.id, permissionsOf(user)];
export async function listNotifications(
  db: DB,
  r: string,
  user: Actor,
  limit = 200,
) {
  const items = await rows<Notice>(
    db,
    `SELECT n.id,n.message,n.created_at,n.type,n.priority,n.module,n.object_id,p.name AS actor_name,EXISTS(SELECT 1 FROM notification_reads nr WHERE nr.notification_id=n.id AND nr.profile_id=$2) AS read FROM notifications n LEFT JOIN domain_events e ON e.id=n.event_id LEFT JOIN profiles p ON p.id=e.actor WHERE ${visible} ORDER BY n.created_at DESC LIMIT ${Math.min(Math.max(1, limit), 200)}`,
    params(r, user),
  );
  const { unread } = await one<{ unread: number }>(
    db,
    `SELECT count(*)::int AS unread FROM notifications n WHERE ${visible} AND NOT EXISTS(SELECT 1 FROM notification_reads nr WHERE nr.notification_id=n.id AND nr.profile_id=$2)`,
    params(r, user),
  );
  return { items, unread };
}
/** Marque comme lue une notification visible, ou toutes si `id` est absent. */
export async function markRead(db: DB, r: string, user: Actor, id?: string) {
  await db.query(
    `INSERT INTO notification_reads SELECT n.id,$2 FROM notifications n WHERE ${visible} ${id ? "AND n.id=$4" : ""} ON CONFLICT DO NOTHING`,
    id ? [...params(r, user), id] : params(r, user),
  );
}
export async function preferences(db: DB, r: string, user: Actor) {
  return rows<{ type: string; muted: boolean }>(
    db,
    "SELECT type,muted FROM notification_preferences WHERE profile_id=$1 AND restaurant_id=$2",
    [user.id, r],
  );
}
export async function setPreference(
  db: DB,
  r: string,
  user: Actor,
  type: string,
  muted: boolean,
) {
  if (!isNotificationType(type))
    throw new Error("Type de notification inconnu.");
  if (notificationCatalog[type].priority === "critical" && muted)
    throw new Error("Les alertes critiques ne peuvent pas être désactivées.");
  await db.query(
    "INSERT INTO notification_preferences VALUES($1,$2,$3,$4) ON CONFLICT(profile_id,restaurant_id,type) DO UPDATE SET muted=$4",
    [user.id, r, type, muted],
  );
}
/**
 * Alertes dérivées de l’état (stocks, péremptions, retards, indisponibilités).
 * Idempotent : chaque situation n’est notifiée qu’une fois par clé.
 */
export async function sweep(db: DB, r: string) {
  const ingredients = await rows<{
    id: string;
    name: string;
    unit: string;
    available: number;
    threshold: number;
  }>(
    db,
    "SELECT i.id,i.name,i.unit,i.threshold::float,coalesce(sum(CASE WHEN l.expires_on>=CURRENT_DATE THEN l.quantity-l.reserved ELSE 0 END),0)::float AS available FROM ingredients i LEFT JOIN stock_lots l ON l.ingredient_id=i.id WHERE i.restaurant_id=$1 GROUP BY i.id",
    [r],
  );
  const { today } = await one<{ today: string }>(
    db,
    "SELECT CURRENT_DATE::text AS today",
  );
  for (const i of ingredients) {
    const out = i.available <= 0;
    if (!out && i.available > i.threshold) continue;
    await emit(db, r, {
      type: out ? "stock.out" : "stock.low",
      module: "stocks",
      objectId: i.id,
      summary: out
        ? `Rupture : ${i.name}`
        : `Stock faible : ${i.name} · ${Math.round(i.available)} ${i.unit} disponibles (seuil ${Math.round(i.threshold)})`,
      data: { available: i.available, threshold: i.threshold },
      notification: {
        dedupKey: `${out ? "stock.out" : "stock.low"}:${i.id}:${today}`,
      },
    });
  }
  const lots = await rows<{
    id: string;
    name: string;
    expires_on: string;
  }>(
    db,
    "SELECT l.id,i.name,l.expires_on::text FROM stock_lots l JOIN ingredients i ON i.id=l.ingredient_id WHERE i.restaurant_id=$1 AND l.quantity>l.reserved AND l.expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE+$2::int",
    [r, alertSettings.expiryDays],
  );
  for (const l of lots)
    await emit(db, r, {
      type: "stock.expiring",
      module: "stocks",
      objectId: l.id,
      summary: `Lot de ${l.name} à utiliser avant le ${l.expires_on.split("-").reverse().join("/")}`,
      notification: { dedupKey: `stock.expiring:${l.id}` },
    });
  const late = await rows<{
    id: string;
    station: "kitchen" | "bar";
    table_number: number | null;
    names: string;
  }>(
    db,
    "SELECT o.id,i.station,t.number AS table_number,string_agg(i.quantity||' × '||i.name,', ' ORDER BY i.name) AS names FROM orders o JOIN order_items i ON i.order_id=o.id AND i.status IN ('waiting','preparing') LEFT JOIN table_sessions s ON s.id=o.session_id LEFT JOIN dining_tables t ON t.id=s.table_id WHERE o.restaurant_id=$1 AND o.status='active' AND o.created_at<now()-make_interval(mins=>$2::int) GROUP BY o.id,i.station,t.number",
    [r, alertSettings.lateMinutes],
  );
  for (const o of late)
    await emit(db, r, {
      type: "order.late",
      module: o.station,
      objectId: o.id,
      summary: `En retard (+${alertSettings.lateMinutes} min) · ${o.table_number ? `Table ${o.table_number}` : `#${o.id.slice(0, 6)}`} · ${o.names}`,
      data: { station: o.station },
      notification: { dedupKey: `order.late:${o.id}:${o.station}` },
    });
  const unavailable = await rows<{ id: string; name: string }>(
    db,
    "SELECT m.id,m.name FROM menu_items m WHERE m.restaurant_id=$1 AND m.enabled AND m.archived_at IS NULL AND EXISTS(SELECT 1 FROM recipe_ingredients ri WHERE ri.menu_id=m.id) AND (SELECT min(floor(coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=ri.ingredient_id AND l.expires_on>=CURRENT_DATE),0)/ri.quantity)) FROM recipe_ingredients ri WHERE ri.menu_id=m.id)<1",
    [r],
  );
  for (const m of unavailable)
    await emit(db, r, {
      type: "menu.unavailable",
      module: "menu",
      objectId: m.id,
      summary: `${m.name} ne peut plus être préparé : ingrédients insuffisants`,
      notification: { dedupKey: `menu.unavailable:${m.id}:${today}` },
    });
}
const lastSweep = new Map<string, number>();
/**
 * Lance `sweep` dans sa propre transaction, au plus toutes les `minMs` par
 * établissement. Une erreur n’interrompt jamais la requête appelante.
 */
export async function runSweep(
  db: { transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> },
  r: string,
  minMs = 30000,
) {
  const now = Date.now();
  if (now - (lastSweep.get(r) ?? 0) < minMs) return;
  lastSweep.set(r, now);
  try {
    await db.transaction((tx) => sweep(tx, r));
  } catch (e) {
    console.error("Alertes non calculées", r, e);
  }
}
