import type { Snapshot } from "@/lib/types";

/** Corps envoyé tel quel à POST /api/v1/action après confirmation. */
export type ActionPayload = { action: string } & Record<string, unknown>;

/** Action proposée par Cuisine IA : rien n’est exécuté sans confirmation. */
export type Proposal = {
  id: string;
  title: string;
  lines: string[];
  warning?: string;
  confirmLabel: string;
  actions: ActionPayload[];
  /** Suggestions affichées une fois l’action confirmée. */
  next: string[];
  /** Module du poste à ouvrir après confirmation. */
  open?: string;
};

export type Link = { label: string; href: string };

export type Engine = "reflex" | "llm" | "free" | "none";

export type Answer = {
  reply: string;
  proposals: Proposal[];
  suggestions: string[];
  links: Link[];
  navigate?: string;
};

export type AssistantReply = Answer & {
  engine: Engine;
  credits: number;
  balance: number;
};

export type Turn = { role: "user" | "assistant"; content: string };

/** Vue compacte du snapshot, limitée à ce que l’utilisateur peut déjà voir. */
export type AssistantContext = {
  restaurant: { id: string; name: string };
  user: { name: string; roles: string[] };
  plan: number;
  now: string;
  modules: string[];
  permissions: string[];
  menu: {
    id: string;
    name: string;
    category: string;
    price: number;
    enabled: boolean;
    portions: number;
    station: string;
  }[];
  tables: {
    id: string;
    number: number;
    capacity: number;
    status: string;
    zone: string;
  }[];
  orders: {
    id: string;
    session: string | null;
    table: number | null;
    channel: string;
    status: string;
    customer: string;
    created_at: string;
    items: {
      id: string;
      name: string;
      quantity: number;
      price: number;
      status: string;
      station: string;
    }[];
  }[];
  ingredients: {
    id: string;
    name: string;
    unit: string;
    available: number;
    threshold: number;
  }[];
  reservations: {
    id: string;
    name: string;
    guests: number;
    starts_at: string;
    status: string;
    table_id: string | null;
  }[];
  paidToday: number;
  paymentsToday: number;
  sales: { day: string; total: number }[];
  customers: number;
  balance: number;
};

export function assistantContext(
  s: Snapshot,
  modules: string[],
  permissions: string[],
  balance: number,
): AssistantContext {
  const today = new Date(s.now).toLocaleDateString("fr-CA", {
    timeZone: "Europe/Paris",
  });
  const sameDay = (d: string) =>
    new Date(d).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }) ===
    today;
  const payments = s.payments.filter((p) => sameDay(p.created_at));
  return {
    restaurant: { id: s.restaurant.id, name: s.restaurant.name },
    user: { name: s.user.name, roles: s.user.roles ?? [s.user.role] },
    plan: s.plan,
    now: s.now,
    modules,
    permissions,
    menu: s.menu
      .filter((m) => !m.archived_at)
      .map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        price: m.price,
        enabled: m.enabled,
        portions: m.portions,
        station: m.station,
      })),
    tables: s.tables
      .filter((t) => !t.archived_at)
      .map((t) => ({
        id: t.id,
        number: t.number,
        capacity: t.capacity,
        status: t.status,
        zone: t.zone,
      })),
    orders: s.orders
      .filter((o) => ["active", "pending"].includes(o.status))
      .slice(0, 60)
      .map((o) => ({
        id: o.id,
        session: o.session_id,
        table: o.table_number,
        channel: o.channel,
        status: o.status,
        customer: o.customer_name,
        created_at: o.created_at,
        items: o.items.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          status: i.status,
          station: i.station,
        })),
      })),
    ingredients: s.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      available: i.available,
      threshold: i.threshold,
    })),
    reservations: s.reservations
      .filter((r) => new Date(r.ends_at) >= new Date(s.now))
      .slice(0, 40)
      .map((r) => ({
        id: r.id,
        name: r.name,
        guests: r.guests,
        starts_at: r.starts_at,
        status: r.status,
        table_id: r.table_id,
      })),
    paidToday: payments.reduce((sum, p) => sum + p.amount, 0),
    paymentsToday: payments.length,
    sales: s.sales.slice(-14),
    customers: s.customers.length,
    balance,
  };
}
