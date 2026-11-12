/* Constructeurs d’actions, partagés par le moteur réflexe et l’IA générative.
   Ils valident tout contre le contexte (carte, tables, commandes) et
   produisent des charges utiles exactes pour POST /api/v1/action. Le serveur
   revérifie ensuite permissions, stocks et transitions à l’exécution. */
import { randomUUID } from "node:crypto";
import { euros, hour } from "@/domain/assistant/text";
import type { AssistantContext, Proposal } from "./types";

type Built = { reply: string; proposal?: Proposal };

const tableOf = (ctx: AssistantContext, n: number) =>
  ctx.tables.find((t) => t.number === n);
const ordersOf = (ctx: AssistantContext, n: number) =>
  ctx.orders.filter((o) => o.table === n && o.status === "active");
const can = (ctx: AssistantContext, permission: string) =>
  ctx.permissions.includes(permission);

export function orderProposal(
  ctx: AssistantContext,
  tableNumber: number | null,
  lines: { menu: string; quantity: number; note?: string }[],
  customer = "",
): Built {
  if (!can(ctx, "orders"))
    return { reply: "Votre profil ne permet pas de prendre des commandes." };
  const table = tableNumber ? tableOf(ctx, tableNumber) : undefined;
  if (tableNumber && !table)
    return {
      reply: `Je ne trouve pas de table ${tableNumber}. Tables disponibles : ${ctx.tables
        .map((t) => t.number)
        .sort((a, b) => a - b)
        .join(", ")}.`,
    };
  const items = lines
    .map((l) => ({ ...l, item: ctx.menu.find((m) => m.id === l.menu) }))
    .filter((l) => l.item && l.quantity > 0);
  if (!items.length) return { reply: "Aucun produit reconnu à la carte." };
  const warnings: string[] = [];
  for (const l of items) {
    if (!l.item!.enabled) warnings.push(`${l.item!.name} est désactivé à la carte.`);
    else if (l.item!.portions < l.quantity)
      warnings.push(
        l.item!.portions
          ? `Plus que ${l.item!.portions} portion(s) de ${l.item!.name}.`
          : `${l.item!.name} est en rupture de stock.`,
      );
  }
  if (table?.status === "unavailable")
    warnings.push(`La table ${table.number} est marquée indisponible.`);
  const total = items.reduce((s, l) => s + l.item!.price * l.quantity, 0);
  const where = table ? `table ${table.number}` : "à emporter";
  const proposal: Proposal = {
    id: randomUUID(),
    title: `Commande ${where}`,
    lines: [
      ...items.map(
        (l) =>
          `${l.quantity} × ${l.item!.name}${l.note ? ` (${l.note})` : ""} — ${euros(l.item!.price * l.quantity)}`,
      ),
      `Total : ${euros(total)}`,
    ],
    warning: warnings.join(" ") || undefined,
    confirmLabel: "Envoyer en préparation",
    actions: [
      {
        action: "order",
        data: {
          restaurant: ctx.restaurant.id,
          ...(table ? { table: table.id } : {}),
          channel: "staff",
          customer: customer.slice(0, 100),
          contact: "",
          key: `ia-${randomUUID()}`,
          items: items.map((l) => ({
            menu: l.item!.id,
            quantity: Math.min(50, Math.round(l.quantity)),
            note: (l.note ?? "").slice(0, 300),
          })),
        },
      },
    ],
    next: table
      ? [
          `Où en est la table ${table.number} ?`,
          `Encaisse la table ${table.number} par carte`,
          "Ouvre la cuisine",
        ]
      : ["Commandes en cours", "Ouvre la cuisine"],
    open: "orders",
  };
  return {
    reply: `Voici la commande ${where} prête à partir. Confirmez pour l’envoyer en cuisine et au bar.`,
    proposal,
  };
}

export function paymentProposal(
  ctx: AssistantContext,
  tableNumber: number,
  method: "card" | "cash" | "other",
): Built {
  if (!can(ctx, "payments"))
    return { reply: "Votre profil ne permet pas de déclarer un règlement." };
  const orders = ordersOf(ctx, tableNumber);
  if (!orders.length)
    return { reply: `Aucune commande en cours à la table ${tableNumber}.` };
  const items = orders.flatMap((o) => o.items).filter((i) => i.status !== "cancelled");
  const pending = items.filter((i) => ["waiting", "preparing"].includes(i.status));
  if (pending.length)
    return {
      reply: `La table ${tableNumber} ne peut pas encore être réglée : ${pending
        .map((i) => `${i.quantity} × ${i.name} (${i.status === "waiting" ? "en attente" : "en préparation"})`)
        .join(", ")}. Servez ou annulez ces produits d’abord.`,
    };
  const ready = items.filter((i) => i.status === "ready");
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const groups = [
    ...new Map(orders.map((o) => [o.session ?? o.id, o.id])).values(),
  ];
  const label = { card: "carte", cash: "espèces", other: "autre moyen" }[method];
  return {
    reply: `Règlement de la table ${tableNumber} prêt : ${euros(total)} en ${label}. Encaissez sur votre terminal, puis confirmez.`,
    proposal: {
      id: randomUUID(),
      title: `Règlement table ${tableNumber}`,
      lines: [
        ...items.map((i) => `${i.quantity} × ${i.name} — ${euros(i.price * i.quantity)}`),
        `Total : ${euros(total)} · ${label}`,
      ],
      warning: ready.length
        ? `${ready.length} produit(s) prêt(s) seront d’abord marqués servis.`
        : undefined,
      confirmLabel: "Déclarer le règlement",
      actions: [
        ...ready.map((i) => ({ action: "item", id: i.id, status: "served" })),
        ...groups.map((id) => ({ action: "pay", id, method })),
      ],
      next: [`Libère la table ${tableNumber}`, "Chiffre du jour", "Commandes en cours"],
      open: "dining",
    },
  };
}

export function serveProposal(ctx: AssistantContext, tableNumber: number): Built {
  if (!can(ctx, "orders"))
    return { reply: "Votre profil ne permet pas de marquer des produits servis." };
  const items = ordersOf(ctx, tableNumber)
    .flatMap((o) => o.items)
    .filter((i) => i.status === "ready");
  if (!items.length)
    return { reply: `Rien n’est prêt à servir à la table ${tableNumber} pour l’instant.` };
  return {
    reply: `${items.length} produit(s) prêt(s) pour la table ${tableNumber}.`,
    proposal: {
      id: randomUUID(),
      title: `Service table ${tableNumber}`,
      lines: items.map((i) => `${i.quantity} × ${i.name}`),
      confirmLabel: "Marquer servis",
      actions: items.map((i) => ({ action: "item", id: i.id, status: "served" })),
      next: [`Encaisse la table ${tableNumber} par carte`, "Commandes en cours"],
    },
  };
}

export function itemStatusProposal(
  ctx: AssistantContext,
  ids: string[],
  status: "preparing" | "ready" | "served" | "cancelled",
): Built {
  const items = ctx.orders
    .flatMap((o) => o.items.map((i) => ({ ...i, table: o.table })))
    .filter((i) => ids.includes(i.id));
  if (!items.length) return { reply: "Produits introuvables dans les commandes en cours." };
  const label = {
    preparing: "Lancer la préparation",
    ready: "Marquer prêts",
    served: "Marquer servis",
    cancelled: "Annuler ces produits",
  }[status];
  return {
    reply: `${label} : ${items.length} produit(s).`,
    proposal: {
      id: randomUUID(),
      title: label,
      lines: items.map(
        (i) => `${i.quantity} × ${i.name}${i.table ? ` · table ${i.table}` : ""}`,
      ),
      warning: status === "cancelled" ? "Une préparation commencée sera comptée en perte." : undefined,
      confirmLabel: label,
      actions: items.map((i) => ({ action: "item", id: i.id, status })),
      next: ["Commandes en cours"],
    },
  };
}

export function tableStatusProposal(
  ctx: AssistantContext,
  tableNumber: number,
  status: "free" | "cleaning" | "unavailable",
): Built {
  const table = tableOf(ctx, tableNumber);
  if (!table) return { reply: `Je ne trouve pas de table ${tableNumber}.` };
  if (table.status === "occupied")
    return {
      reply: `La table ${tableNumber} a encore un service en cours : réglez-la d’abord.`,
    };
  const labels: Record<string, string> = {
    free: "libre",
    occupied: "occupée",
    cleaning: "à débarrasser",
    unavailable: "indisponible",
  };
  const label = labels[status];
  return {
    reply: `Je passe la table ${tableNumber} en « ${label} » ?`,
    proposal: {
      id: randomUUID(),
      title: `Table ${tableNumber} · ${label}`,
      lines: [`Statut actuel : ${labels[table.status] ?? table.status}`, `Nouveau statut : ${label}`],
      confirmLabel: "Changer le statut",
      actions: [{ action: "table", id: table.id, status }],
      next: ["Tables libres", "Réservations à venir"],
      open: "dining",
    },
  };
}

export function reservationProposal(
  ctx: AssistantContext,
  id: string,
  status: "confirmed" | "arrived" | "declined" | "cancelled" | "no_show",
): Built {
  const r = ctx.reservations.find((x) => x.id === id);
  if (!r) return { reply: "Réservation introuvable." };
  const label = {
    confirmed: "Confirmer",
    arrived: "Marquer arrivée",
    declined: "Refuser",
    cancelled: "Annuler",
    no_show: "Marquer absente",
  }[status];
  return {
    reply: `${label} la réservation de ${r.name} ?`,
    proposal: {
      id: randomUUID(),
      title: `${label} · ${r.name}`,
      lines: [
        `${r.guests} couvert(s) à ${hour(r.starts_at)}`,
        `Statut actuel : ${{ requested: "à confirmer", confirmed: "confirmée", arrived: "arrivée", declined: "refusée", cancelled: "annulée", no_show: "absente" }[r.status] ?? r.status}`,
      ],
      confirmLabel: label,
      actions: [{ action: "reservation", id: r.id, status }],
      next: ["Réservations à venir", "Tables libres"],
      open: "reservations",
    },
  };
}
