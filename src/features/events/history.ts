import { rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { money } from "@/lib/domain";
import { permissionsOf } from "@/lib/permissions";
import type { actionSchema } from "@/lib/actions";
import { orderLabel } from "@/features/orders/service";
import { category, type CategoryId } from "./categories";
import type { DomainEvent } from "./service";
import type { z } from "zod";
type Action = z.infer<typeof actionSchema>;
const name = async (db: DB, sql: string, params: unknown[]) =>
  (await rows<{ name: string }>(db, sql, params))[0]?.name ??
  "élément supprimé";
const entry = (
  a: Action,
  module: CategoryId,
  summary: string,
  extra: Partial<DomainEvent> = {},
): DomainEvent => ({
  type: `action.${a.action}`,
  module,
  summary,
  objectId: "id" in a ? (a.id ?? null) : null,
  ...extra,
});
/**
 * Entrée d’historique d’une action du poste de travail, calculée AVANT son
 * exécution (les libellés lisent l’état antérieur, ex. un produit supprimé),
 * émise seulement si l’action réussit. `null` : l’action émet ses propres
 * événements dans son service, ou n’a pas de portée opérationnelle.
 */
export async function describeAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
): Promise<DomainEvent | null> {
  switch (a.action) {
    case "createProduct":
      return entry(a, "menu", `Produit créé : ${a.name} (${a.category})`);
    case "productLifecycle":
      return entry(
        a,
        "menu",
        `${{ archive: "Produit archivé", restore: "Produit remis à la carte", delete: "Produit supprimé" }[a.operation]} : ${await name(db, "SELECT name FROM menu_items WHERE id=$1 AND restaurant_id=$2", [a.id, r])}`,
      );
    case "issuePromo":
      return entry(
        a,
        "customers",
        `Code ${a.code} attribué à ${await name(db, "SELECT name FROM customers WHERE id=$1 AND restaurant_id=$2", [a.customer, r])} · ${a.points} points`,
        { objectId: a.customer },
      );
    case "cancelPromo":
      return entry(
        a,
        "customers",
        `Code annulé : ${await name(db, "SELECT p.code||' · '||c.name AS name FROM promo_codes p JOIN customers c ON c.id=p.customer_id WHERE p.id=$1 AND p.restaurant_id=$2", [a.id, r])}`,
      );
    case "confirmOrder": {
      const known = await rows(
        db,
        "SELECT 1 FROM orders WHERE id=$1 AND restaurant_id=$2",
        [a.id, r],
      );
      return entry(
        a,
        "orders",
        `${a.accept ? "Demande acceptée" : "Demande refusée"} · ${known.length ? await orderLabel(db, a.id) : "commande"}`,
      );
    }
    case "table":
      return entry(
        a,
        "dining",
        `Table ${await name(db, "SELECT number::text AS name FROM dining_tables WHERE id=$1 AND restaurant_id=$2", [a.id, r])} marquée ${a.status === "free" ? "libre" : "indisponible"}`,
      );
    case "reservation": {
      const statuses: Record<string, string> = {
        confirmed: "confirmée",
        arrived: "clients arrivés",
        declined: "refusée",
        cancelled: "annulée",
        no_show: "absence",
      };
      return entry(
        a,
        "reservations",
        `Réservation ${await name(db, "SELECT name||' · '||guests||' pers. · '||to_char(starts_at AT TIME ZONE 'Europe/Paris','DD/MM HH24:MI') AS name FROM reservations WHERE id=$1 AND restaurant_id=$2", [a.id, r])} : ${statuses[a.status]}`,
      );
    }
    case "supplier":
      return entry(a, "suppliers", `Fournisseur ajouté : ${a.name}`);
    case "purchase":
      return entry(
        a,
        "deliveries",
        `Commande fournisseur : ${a.quantity} ${await name(db, "SELECT unit||' de '||name AS name FROM ingredients WHERE id=$1 AND restaurant_id=$2", [a.ingredient, r])} chez ${await name(db, "SELECT name FROM suppliers WHERE id=$1 AND restaurant_id=$2", [a.supplier, r])}, prévue le ${a.due.split("-").reverse().join("/")}`,
        { objectId: a.ingredient },
      );
    case "clock":
      return entry(
        a,
        "attendance",
        `${{ start: "Début de service", break: "Pause", resume: "Reprise", end: "Fin de service" }[a.event]} · ${user.name}`,
        { objectId: user.id },
      );
    case "customer":
      return entry(a, "customers", `Client ajouté : ${a.name}`);
    case "loyalty":
      return entry(
        a,
        "customers",
        `${a.points > 0 ? "+" : ""}${a.points} points · ${await name(db, "SELECT name FROM customers WHERE id=$1 AND restaurant_id=$2", [a.id, r])} · ${a.reason}`,
      );
    case "menu": {
      const before = (
        await rows<{ name: string; price: number; enabled: boolean }>(
          db,
          "SELECT name,price,enabled FROM menu_items WHERE id=$1 AND restaurant_id=$2",
          [a.id, r],
        )
      )[0];
      const changes = [
        before && before.price !== a.price
          ? `prix ${money(before.price)} → ${money(a.price)}`
          : "",
        before && before.enabled !== a.enabled
          ? a.enabled
            ? "remis en vente"
            : "retiré de la vente"
          : "",
        before && before.name !== a.name ? `ancien nom ${before.name}` : "",
      ].filter(Boolean);
      return entry(
        a,
        "menu",
        `Fiche modifiée : ${a.name}${changes.length ? ` · ${changes.join(" · ")}` : ""}`,
      );
    }
    case "recipe":
      return entry(
        a,
        "recipes",
        `Recette de ${await name(db, "SELECT name FROM menu_items WHERE id=$1 AND restaurant_id=$2", [a.menu, r])} : ${a.quantity} ${await name(db, "SELECT unit||' de '||name AS name FROM ingredients WHERE id=$1 AND restaurant_id=$2", [a.ingredient, r])}`,
        { objectId: a.menu },
      );
    case "restaurant":
      return entry(a, "settings", "Coordonnées et objectif mis à jour");
    case "addRestaurant":
      return entry(a, "settings", `Établissement créé : ${a.name}`);
    default:
      return null;
  }
}
export type HistoryEntry = {
  id: string;
  type: string;
  module: string;
  summary: string;
  object_id: string | null;
  created_at: string;
  actor_name: string | null;
};
/**
 * Historique visible par le profil : événements de ses rubriques
 * (permissions effectives), ou dont il est l’auteur. Pagination par date.
 */
export async function listHistory(
  db: DB,
  r: string,
  user: Actor,
  options: {
    category?: string;
    /** Curseur `next` renvoyé par la page précédente. */
    before?: string;
    days?: number;
    query?: string;
    limit?: number;
  } = {},
) {
  const params: unknown[] = [r, user.id, permissionsOf(user)];
  const where = [
    "e.restaurant_id=$1",
    "(e.permissions IS NULL OR e.permissions && $3::text[] OR e.actor=$2)",
  ];
  if (options.category) {
    params.push(category(options.category).id);
    where.push(`e.module=$${params.length}`);
  }
  const [at, id] = options.before?.split("|") ?? [];
  if (
    at &&
    id &&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/.test(
      at,
    )
  ) {
    params.push(at, id);
    where.push(
      `(e.created_at,e.id)<($${params.length - 1}::timestamptz,$${params.length})`,
    );
  }
  if (options.days) {
    params.push(options.days);
    where.push(`e.created_at>now()-make_interval(days=>$${params.length})`);
  }
  if (options.query) {
    params.push(`%${options.query.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(
      `(e.summary ILIKE $${params.length} OR coalesce(p.name,'') ILIKE $${params.length})`,
    );
  }
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const items = await rows<HistoryEntry & { at: string }>(
    db,
    `SELECT e.id,e.type,e.module,e.summary,e.object_id,e.created_at,e.created_at::text AS at,p.name AS actor_name FROM domain_events e LEFT JOIN profiles p ON p.id=e.actor WHERE ${where.join(" AND ")} ORDER BY e.created_at DESC,e.id DESC LIMIT ${limit + 1}`,
    params,
  );
  const page = items.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(({ at: _at, ...e }) => (void _at, e)),
    hasMore: items.length > limit,
    /** Curseur exact (microsecondes) : un même instant peut porter plusieurs événements. */
    next: last ? `${last.at}|${last.id}` : null,
  };
}
