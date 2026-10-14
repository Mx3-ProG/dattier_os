import {
  productSchema,
  createProduct,
  lifecycle,
} from "@/features/catalog/service";
import {
  promoSchema,
  issuePromo,
  cancelPromo,
} from "@/features/loyalty/service";
import { randomUUID as uuid } from "node:crypto";
import { z } from "zod";
import { rows, one, type DB } from "./database/db";
import type { Actor } from "./auth/session";
import { requirePermission } from "./permissions";
import {
  changeItem,
  createOrder,
  log,
  movement,
  notify,
  orderSchema,
  pay,
  reserve,
} from "@/features/orders/service";
const text = z.string().trim().min(1).max(300),
  qty = z.coerce.number().positive().max(1000000),
  id = z.string().min(1),
  dt = z.string().datetime();
export const actionSchema = z.discriminatedUnion("action", [
  productSchema,
  promoSchema,
  z.object({
    action: z.literal("productLifecycle"),
    id,
    operation: z.enum(["archive", "restore", "delete"]),
  }),
  z.object({ action: z.literal("cancelPromo"), id }),
  z.object({ action: z.literal("order"), data: orderSchema }),
  z.object({
    action: z.literal("item"),
    id,
    status: z.enum(["preparing", "ready", "served", "cancelled"]),
  }),
  z.object({
    action: z.literal("pay"),
    id,
    method: z.enum(["card", "cash", "other"]),
    customer: z.string().optional(),
    promo: z.string().max(40).optional(),
  }),
  z.object({ action: z.literal("confirmOrder"), id, accept: z.boolean() }),
  z.object({
    action: z.literal("table"),
    id,
    status: z.enum(["free", "unavailable"]),
  }),
  z.object({
    action: z.literal("reservation"),
    id,
    status: z.enum([
      "confirmed",
      "arrived",
      "declined",
      "cancelled",
      "no_show",
    ]),
    table: id.optional(),
  }),
  z.object({
    action: z.literal("stock"),
    id,
    quantity: z.coerce.number().min(0).max(1000000),
    reason: text,
    kind: z.enum(["waste", "inventory"]),
  }),
  z.object({ action: z.literal("supplier"), name: text, contact: text }),
  z.object({
    action: z.literal("purchase"),
    supplier: id,
    ingredient: id,
    quantity: qty,
    due: z.string().date(),
  }),
  z.object({
    action: z.literal("receive"),
    id,
    quantity: qty,
    expires: z.string().date(),
  }),
  z.object({ action: z.literal("shift"), profile: id, start: dt, end: dt }),
  z.object({ action: z.literal("deleteShift"), id }),
  z.object({
    action: z.literal("clock"),
    event: z.enum(["start", "break", "resume", "end"]),
  }),
  z.object({
    action: z.literal("expense"),
    label: text,
    amount: z.coerce.number().int().positive(),
  }),
  z.object({
    action: z.literal("customer"),
    name: text,
    contact: text,
    consent: z.boolean(),
  }),
  z.object({
    action: z.literal("loyalty"),
    id,
    points: z.coerce.number().int().min(-10000).max(10000),
    reason: text,
  }),
  z.object({
    action: z.literal("menu"),
    id,
    name: text,
    price: z.coerce.number().int().min(0),
    enabled: z.boolean(),
    description: z.string().max(500),
  }),
  z.object({
    action: z.literal("recipe"),
    menu: id,
    ingredient: id,
    quantity: qty,
  }),
  z.object({ action: z.literal("read") }),
  z.object({
    action: z.literal("restaurant"),
    name: text,
    address: text,
    phone: z.string().max(50),
    goal: z.coerce.number().int().positive(),
  }),
  z.object({ action: z.literal("addRestaurant"), name: text }),
]);
export async function perform(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof actionSchema>,
) {
  switch (a.action) {
    case "createProduct":
      return createProduct(db, r, user, a);
    case "productLifecycle":
      return lifecycle(db, r, user, a.id, a.operation);
    case "issuePromo":
      return issuePromo(db, r, user, a);
    case "cancelPromo":
      return cancelPromo(db, r, user, a.id);
    case "order":
      if (a.data.restaurant !== r)
        throw new Error("Établissement incompatible.");
      return createOrder(db, a.data, user);
    case "item":
      return changeItem(db, r, a.id, a.status, user);
    case "pay":
      return pay(db, r, a.id, a.method, user, a.customer, a.promo);
    case "confirmOrder": {
      requirePermission(user.role, "orders");
      const o = await one<{ status: string; session_id: string | null }>(
        db,
        "SELECT status,session_id FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [a.id, r],
      );
      if (o.status !== "pending") throw new Error("Demande déjà traitée.");
      if (a.accept) {
        if (o.session_id)
          await one(
            db,
            "SELECT id FROM table_sessions WHERE id=$1 AND closed_at IS NULL",
            [o.session_id],
          );
        const items = await rows<{
          id: string;
          menu_id: string;
          quantity: number;
        }>(db, "SELECT * FROM order_items WHERE order_id=$1", [a.id]);
        for (const i of items)
          await reserve(db, r, i.id, i.menu_id, i.quantity, user.id);
      }
      await db.query("UPDATE orders SET status=$2 WHERE id=$1", [
        a.id,
        a.accept ? "active" : "cancelled",
      ]);
      break;
    }
    case "table": {
      requirePermission(user.role, "orders");
      const t = await one<{ status: string }>(
        db,
        "SELECT status FROM dining_tables WHERE id=$1 AND restaurant_id=$2",
        [a.id, r],
      );
      if (t.status === "occupied")
        throw new Error("Clôturez d’abord le service de cette table.");
      await db.query("UPDATE dining_tables SET status=$2 WHERE id=$1", [
        a.id,
        a.status,
      ]);
      break;
    }
    case "reservation": {
      requirePermission(user.role, "reservations");
      const res = await one<{
        status: string;
        table_id: string | null;
        guests: number;
        starts_at: string;
        ends_at: string;
      }>(
        db,
        "SELECT * FROM reservations WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [a.id, r],
      );
      const transitions: Record<string, string[]> = {
        requested: ["confirmed", "declined", "cancelled"],
        confirmed: ["confirmed", "arrived", "cancelled", "no_show"],
        arrived: ["cancelled"],
      };
      if (!transitions[res.status]?.includes(a.status))
        throw new Error("Transition de réservation impossible.");
      const table = a.table || res.table_id;
      if (["confirmed", "arrived"].includes(a.status)) {
        if (!table) throw new Error("Affectez une table.");
        const t = await one<{ capacity: number; status: string }>(
          db,
          "SELECT * FROM dining_tables WHERE id=$1 AND restaurant_id=$2",
          [table, r],
        );
        if (
          t.capacity < res.guests ||
          t.status === "unavailable" ||
          (a.status === "arrived" && t.status !== "free")
        )
          throw new Error("Capacité ou état de table incompatible.");
        const conflicts = await rows(
          db,
          "SELECT id FROM reservations WHERE table_id=$1 AND id<>$2 AND status IN ('confirmed','arrived') AND starts_at<$3 AND ends_at>$4",
          [table, a.id, res.ends_at, res.starts_at],
        );
        if (conflicts.length)
          throw new Error("Cette table est déjà réservée sur ce créneau.");
      }
      await db.query(
        "UPDATE reservations SET status=$2,table_id=$3 WHERE id=$1",
        [a.id, a.status, table],
      );
      break;
    }
    case "stock": {
      requirePermission(user.role, "stock");
      if (
        a.kind === "inventory" &&
        !["OWNER", "SUPER_ADMIN", "MANAGER", "STOCK_MANAGER"].includes(
          user.role,
        )
      )
        throw new Error("Correction d’inventaire non autorisée.");
      const lot = await one<{ quantity: number; reserved: number }>(
        db,
        "SELECT l.quantity::float,l.reserved::float FROM stock_lots l JOIN ingredients i ON i.id=l.ingredient_id WHERE l.id=$1 AND i.restaurant_id=$2 FOR UPDATE",
        [a.id, r],
      );
      const next = a.kind === "waste" ? lot.quantity - a.quantity : a.quantity;
      if (next < lot.reserved)
        throw new Error("Quantité insuffisante ou déjà réservée.");
      await db.query("UPDATE stock_lots SET quantity=$2 WHERE id=$1", [
        a.id,
        next,
      ]);
      await movement(
        db,
        r,
        a.id,
        next - lot.quantity,
        a.kind,
        a.reason,
        user.id,
        a.id,
      );
      break;
    }
    case "supplier":
      requirePermission(user.role, "purchases");
      await db.query("INSERT INTO suppliers VALUES($1,$2,$3,$4,2)", [
        uuid(),
        r,
        a.name,
        a.contact,
      ]);
      break;
    case "purchase":
      requirePermission(user.role, "purchases");
      await one(
        db,
        "SELECT id FROM suppliers WHERE id=$1 AND restaurant_id=$2",
        [a.supplier, r],
      );
      await one(
        db,
        "SELECT id FROM ingredients WHERE id=$1 AND restaurant_id=$2",
        [a.ingredient, r],
      );
      await db.query(
        "INSERT INTO purchase_orders(id,restaurant_id,supplier_id,ingredient_id,quantity,due_on) VALUES($1,$2,$3,$4,$5,$6)",
        [uuid(), r, a.supplier, a.ingredient, a.quantity, a.due],
      );
      break;
    case "receive": {
      requirePermission(user.role, "purchases");
      const p = await one<{
        ingredient_id: string;
        quantity: number;
        received: number;
        status: string;
      }>(
        db,
        "SELECT *,quantity::float,received::float FROM purchase_orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [a.id, r],
      );
      if (
        ["cancelled", "received"].includes(p.status) ||
        a.quantity > p.quantity - p.received
      )
        throw new Error("Quantité supérieure au restant attendu.");
      if (a.expires < new Date().toISOString().slice(0, 10))
        throw new Error("Un lot reçu doit être utilisable.");
      const lot = uuid();
      await db.query(
        "INSERT INTO stock_lots(id,ingredient_id,quantity,expires_on) VALUES($1,$2,$3,$4)",
        [lot, p.ingredient_id, a.quantity, a.expires],
      );
      await db.query("INSERT INTO receipts VALUES($1,$2,$3,$4,$5,now())", [
        uuid(),
        a.id,
        lot,
        a.quantity,
        user.id,
      ]);
      await db.query(
        "UPDATE purchase_orders SET received=received+$2,status=$3 WHERE id=$1",
        [
          a.id,
          a.quantity,
          p.received + a.quantity === p.quantity ? "received" : "partial",
        ],
      );
      await movement(
        db,
        r,
        lot,
        a.quantity,
        "receipt",
        "Réception fournisseur",
        user.id,
        a.id,
      );
      await notify(db, r, "Livraison réceptionnée · stocks actualisés");
      break;
    }
    case "shift": {
      requirePermission(user.role, "team");
      await one(
        db,
        "SELECT profile_id FROM memberships WHERE profile_id=$1 AND restaurant_id=$2",
        [a.profile, r],
      );
      if (a.start >= a.end) throw new Error("Horaire de fin invalide.");
      if (
        (
          await rows(
            db,
            "SELECT id FROM shifts WHERE profile_id=$1 AND starts_at<$2 AND ends_at>$3",
            [a.profile, a.end, a.start],
          )
        ).length
      )
        throw new Error("Créneau en conflit.");
      await db.query("INSERT INTO shifts VALUES($1,$2,$3,$4,$5)", [
        uuid(),
        r,
        a.profile,
        a.start,
        a.end,
      ]);
      await notify(db, r, "Planning mis à jour");
      break;
    }
    case "deleteShift":
      requirePermission(user.role, "team");
      await db.query("DELETE FROM shifts WHERE id=$1 AND restaurant_id=$2", [
        a.id,
        r,
      ]);
      break;
    case "clock": {
      const latest = await rows<{ event: string }>(
        db,
        "SELECT event FROM time_entries WHERE profile_id=$1 AND restaurant_id=$2 ORDER BY created_at DESC LIMIT 1",
        [user.id, r],
      );
      const prev = latest[0]?.event ?? "end";
      if (
        !(
          {
            end: ["start"],
            start: ["break", "end"],
            break: ["resume", "end"],
            resume: ["break", "end"],
          } as Record<string, string[]>
        )[prev].includes(a.event)
      )
        throw new Error("Pointage incompatible avec votre état actuel.");
      await db.query("INSERT INTO time_entries VALUES($1,$2,$3,$4,now())", [
        uuid(),
        r,
        user.id,
        a.event,
      ]);
      break;
    }
    case "expense":
      requirePermission(user.role, "finance");
      await db.query("INSERT INTO expenses VALUES($1,$2,$3,$4,now())", [
        uuid(),
        r,
        a.label,
        a.amount,
      ]);
      break;
    case "customer":
      requirePermission(user.role, "customers");
      await db.query("INSERT INTO customers VALUES($1,$2,$3,$4,$5,0)", [
        uuid(),
        r,
        a.name,
        a.contact,
        a.consent,
      ]);
      break;
    case "loyalty": {
      requirePermission(user.role, "customers");
      const c = await one<{ points: number; consent: boolean }>(
        db,
        "SELECT * FROM customers WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [a.id, r],
      );
      if (!c.consent || c.points + a.points < 0)
        throw new Error("Consentement absent ou solde insuffisant.");
      await db.query("UPDATE customers SET points=points+$2 WHERE id=$1", [
        a.id,
        a.points,
      ]);
      await db.query(
        "INSERT INTO loyalty_transactions VALUES($1,$2,$3,$4,$5,now())",
        [uuid(), a.id, a.points, a.reason, user.id],
      );
      break;
    }
    case "menu":
      requirePermission(user.role, "catalog");
      await db.query(
        "UPDATE menu_items SET name=$3,price=$4,enabled=$5,description=$6 WHERE id=$1 AND restaurant_id=$2",
        [a.id, r, a.name, a.price, a.enabled, a.description],
      );
      break;
    case "recipe":
      requirePermission(user.role, "catalog");
      await one(
        db,
        "SELECT id FROM menu_items WHERE id=$1 AND restaurant_id=$2",
        [a.menu, r],
      );
      await one(
        db,
        "SELECT id FROM ingredients WHERE id=$1 AND restaurant_id=$2",
        [a.ingredient, r],
      );
      await db.query(
        "INSERT INTO recipe_ingredients VALUES($1,$2,$3) ON CONFLICT(menu_id,ingredient_id) DO UPDATE SET quantity=$3",
        [a.menu, a.ingredient, a.quantity],
      );
      break;
    case "read":
      await db.query(
        "INSERT INTO notification_reads SELECT id,$2 FROM notifications WHERE restaurant_id=$1 ON CONFLICT DO NOTHING",
        [r, user.id],
      );
      break;
    case "restaurant":
      requirePermission(user.role, "settings");
      await db.query(
        "UPDATE restaurants SET name=$2,address=$3,phone=$4,goal=$5 WHERE id=$1",
        [r, a.name, a.address, a.phone, a.goal],
      );
      break;
    case "addRestaurant":
      if (!["OWNER", "SUPER_ADMIN"].includes(user.role))
        throw new Error("Accès refusé.");
      {
        const rid = uuid();
        await db.query("INSERT INTO restaurants(id,name) VALUES($1,$2)", [
          rid,
          a.name,
        ]);
        await db.query("INSERT INTO memberships VALUES($1,$2,$3)", [
          user.id,
          rid,
          user.role,
        ]);
        break;
      }
  }
  await log(db, r, user.id, `Action : ${a.action}`, "id" in a ? a.id : null);
}
export const reservationSchema = z.object({
  restaurant: id,
  name: text,
  contact: text,
  guests: z.coerce.number().int().min(1).max(20),
  start: dt,
  note: z.string().max(300).default(""),
});
export async function requestReservation(
  db: DB,
  a: z.infer<typeof reservationSchema>,
) {
  if (new Date(a.start).getTime() < Date.now())
    throw new Error("Choisissez un créneau futur.");
  const id = uuid();
  await one(db, "SELECT id FROM restaurants WHERE id=$1", [a.restaurant]);
  await db.query(
    "INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at,note) VALUES($1,$2,$3,$4,$5,$6,$6::timestamptz+interval '2 hours',$7)",
    [id, a.restaurant, a.name, a.contact, a.guests, a.start, a.note],
  );
  await notify(db, a.restaurant, "Nouvelle demande de réservation");
  await log(db, a.restaurant, null, "Demande de réservation publique", id);
  return id;
}
