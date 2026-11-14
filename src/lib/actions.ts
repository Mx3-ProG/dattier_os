import { observeStaffFloor } from "@/features/floor/capabilities";
import { moduleEnabled, requireModule } from "@/features/modules/access";
import { requirePlan, requirePaidAddon } from "@/features/platform/entitlements";
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
import {
  awardBookingPoints,
  createFlashPromotion,
  engagementSettingsSchema,
  flashSchema,
  saveEngagementSettings,
  stopFlashPromotion,
  stopFlashSchema,
} from "@/features/commerce/engagement";
import {
  tableSchema,
  saveTable,
  moveTable,
  rotateTable,
  tableLifecycle,
  zoneSchemas,
  saveZone,
  moveZone,
  deleteZone,
} from "@/features/floor/service";
import { messageSchema, messageCustomer } from "@/features/messaging/service";
import { randomUUID as uuid } from "node:crypto";
import { z } from "zod";
import { rows, one, type DB } from "./database/db";
import { scope, type Actor } from "./auth/session";
import { pinRequired, recordStaffActivity, staffSchemaReady, type StaffKind } from "@/features/team/pins";
import {
  can,
  requirePermission,
  teamRoles,
  type Permission,
} from "./permissions";
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
  engagementSettingsSchema,
  flashSchema,
  stopFlashSchema,
  messageSchema,
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
    status: z.enum(["free", "cleaning", "unavailable"]),
  }),
  tableSchema,
  ...zoneSchemas,
  z.object({
    action: z.literal("moveTable"),
    id,
    x: z.coerce.number().int().min(0).max(100),
    y: z.coerce.number().int().min(0).max(100),
  }),
  z.object({
    action: z.literal("tableLifecycle"),
    id,
    operation: z.enum(["archive", "restore", "delete"]),
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
  z.object({
    action: z.literal("supplier"),
    name: text,
    contact: text,
    ingredients: z.array(id).max(50).default([]),
  }),
  z.object({
    action: z.literal("supplierIngredient"),
    supplier: id,
    ingredient: id,
    linked: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("ingredient"),
    name: text,
    unit: z.enum(["g", "ml", "unit"]),
    threshold: z.coerce.number().min(0).max(1000000).default(0),
    cost: z.coerce.number().min(0).max(1000000).default(0),
  }),
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
    action: z.literal("addMember"),
    name: z.string().trim().min(2).max(100),
    email: z.union([z.literal(""), z.email().max(150)]).optional(),
    role: z.enum(teamRoles),
  }),
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
    public_composition: z.string().trim().max(2000).optional(),
    allergens: z.string().trim().max(500).optional(),
    seo_title: z.string().trim().max(80).optional(),
    seo_description: z.string().trim().max(200).optional(),
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
type Action = z.infer<typeof actionSchema>;
/** Étapes qu’un membre valide avec son code PIN quand l’établissement l’exige. */
export function pinStep(a: Action): StaffKind | null {
  if (a.action === "order") return a.data.channel === "staff" ? "order" : null;
  if (a.action === "pay") return "payment";
  if (a.action === "item") return a.status === "cancelled" ? "cancel_item" : null;
  if (a.action === "confirmOrder") return a.accept ? "confirm_order" : "decline_order";
  return null;
}
/**
 * `operator` est la personne identifiée par son PIN (vérifié avant, cf. verifyOperator) :
 * l’étape lui est attribuée et ses propres droits s’appliquent, même sur l’appareil d’un autre.
 */
export async function perform(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
  operator?: { id: string; name: string },
) {
  const step = pinStep(a);
  if (!step) return run(db, r, user, a);
  const ready = await staffSchemaReady(db);
  if (!operator && ready && (await pinRequired(db, r)))
    throw new Error("Code PIN requis pour valider cette étape.");
  const doer = operator
    ? await scope(db, { id: operator.id, name: operator.name, role: "WAITER", authIssuedAt: Date.now() }, r)
    : user;
  const result = await run(db, r, doer, a);
  // Journal « qui fait quoi » : alimenté même sans PIN exigé (le compte connecté fait foi).
  if (ready)
    await recordStaffActivity(db, r, {
      profile: doer.id,
      device: user.id,
      kind: step,
      object: a.action === "order" ? (typeof result === "string" ? result : null) : "id" in a ? String(a.id) : null,
      amount:
        a.action === "pay" && result && typeof result === "object" && "amount" in result
          ? Number(result.amount)
          : null,
      detail:
        a.action === "order"
          ? `${a.data.items.reduce((n, i) => n + i.quantity, 0)} article(s)`
          : a.action === "pay"
            ? { card: "Carte", cash: "Espèces", other: "Autre moyen" }[a.method]
            : "",
    });
  return result;
}
async function run(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  if (["issuePromo","cancelPromo","customer","loyalty","engagementSettings",
       "flashPromotion","stopFlashPromotion"].includes(a.action) ||
      (a.action === "pay" && (a.customer || a.promo)))
    await requirePaidAddon(db,r,"loyalty");
  if (["expense","messageCustomer"].includes(a.action))
    await requirePlan(db, r, 39);
  switch (a.action) {
    case "createProduct":
      return createProduct(db, r, user, a);
    case "productLifecycle":
      return lifecycle(db, r, user, a.id, a.operation);
    case "issuePromo":
      return issuePromo(db, r, user, a);
    case "engagementSettings":
      return saveEngagementSettings(db, r, user, a);
    case "flashPromotion":
      return createFlashPromotion(db, r, user, a);
    case "stopFlashPromotion":
      return stopFlashPromotion(db, r, user, a.id);
    case "cancelPromo":
      return cancelPromo(db, r, user, a.id);
    case "messageCustomer": {
      const sent = await messageCustomer(db, r, user, a);
      await log(db, r, user.id, `Message ${a.channel} au client`, a.id);
      return sent;
    }
    case "order":
      if (a.data.restaurant !== r)
        throw new Error("Établissement incompatible.");
      return createOrder(db, a.data, user);
    case "item":
      return changeItem(db, r, a.id, a.status, user);
    case "pay":
      return pay(db, r, a.id, a.method, user, a.customer, a.promo);
    case "confirmOrder": {
      requirePermission(user.roles ?? user.role, "orders");
      const o = await one<{ status: string; session_id: string | null }>(
        db,
        "SELECT status,session_id FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [a.id, r],
      );
      if (o.status !== "pending") throw new Error("Demande déjà traitée.");
      if (
        (
          await rows(
            db,
            "SELECT order_id FROM shop_orders WHERE order_id=$1 AND payment_method='stripe' AND payment_status<>'paid'",
            [a.id],
          )
        ).length
      )
        throw new Error(
          "Paiement en ligne en attente : commande non confirmable.",
        );
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
    case "saveTable":
      return saveTable(db, r, user, a);
    case "moveTable":
      return moveTable(db, r, user, a.id, a.x, a.y);
    case "rotateTable":
      return rotateTable(db, r, user, a.id, a.rotation);
    case "tableLifecycle":
      return tableLifecycle(db, r, user, a.id, a.operation);
    case "saveZone":
      return saveZone(db, r, user, a);
    case "moveZone":
      return moveZone(db, r, user, a.id, a.direction);
    case "deleteZone":
      return deleteZone(db, r, user, a.id);
    case "table": {
      await requireModule(db, r, "floor");
      observeStaffFloor(
        "floor.status",
        user.roles ?? [user.role],
        can(user.roles ?? user.role, "orders"),
      );
      requirePermission(user.roles ?? user.role, "orders");
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
      await requireModule(db, r, "table-booking");
      observeStaffFloor(
        "table-booking.manage",
        user.roles ?? [user.role],
        can(user.roles ?? user.role, "reservations"),
      );
      requirePermission(user.roles ?? user.role, "reservations");
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
      const floor = await moduleEnabled(db, r, "floor");
      if (a.table && !floor)
        throw new Error("Activez le plan de salle pour attribuer une table.");
      const table = a.table || res.table_id;
      // Sans plan de salle, la réservation se confirme sans table (lot P1-a3).
      if (["confirmed", "arrived"].includes(a.status) && (floor || table)) {
        if (!table) throw new Error("Affectez une table.");
        const t = await one<{ capacity: number; status: string }>(
          db,
          "SELECT * FROM dining_tables WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL",
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
          "SELECT id FROM reservations WHERE table_id=$1 AND id<>$2 AND status IN ('requested','confirmed','arrived') AND starts_at<$3 AND ends_at>$4",
          [table, a.id, res.ends_at, res.starts_at],
        );
        if (conflicts.length)
          throw new Error("Cette table est déjà réservée sur ce créneau.");
      }
      await db.query(
        "UPDATE reservations SET status=$2,table_id=$3 WHERE id=$1",
        [a.id, a.status, table],
      );
      if (a.status === "arrived") await awardBookingPoints(db, r, a.id);
      break;
    }
    case "stock": {
      requirePermission(user.roles ?? user.role, "stock");
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
    case "supplier": {
      requirePermission(user.roles ?? user.role, "purchases");
      const supplierId = uuid();
      await db.query("INSERT INTO suppliers VALUES($1,$2,$3,$4,2)", [
        supplierId,
        r,
        a.name,
        a.contact,
      ]);
      for (const ingredient of a.ingredients) {
        await one(
          db,
          "SELECT id FROM ingredients WHERE id=$1 AND restaurant_id=$2",
          [ingredient, r],
        );
        await db.query(
          "INSERT INTO supplier_ingredients(supplier_id,ingredient_id,restaurant_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [supplierId, ingredient, r],
        );
      }
      await log(db, r, user.id, "Fournisseur créé", supplierId);
      return { id: supplierId };
    }
    case "supplierIngredient":
      requirePermission(user.roles ?? user.role, "purchases");
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
        a.linked
          ? "INSERT INTO supplier_ingredients(supplier_id,ingredient_id,restaurant_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING"
          : "DELETE FROM supplier_ingredients WHERE supplier_id=$1 AND ingredient_id=$2 AND restaurant_id=$3",
        [a.supplier, a.ingredient, r],
      );
      break;
    case "ingredient": {
      const roles = user.roles ?? user.role;
      if (
        !["catalog", "stock", "purchases"].some((p) =>
          can(roles, p as Permission),
        )
      )
        throw new Error("Accès refusé pour ce profil.");
      const ingredientId = uuid();
      await db.query(
        "INSERT INTO ingredients(id,restaurant_id,name,unit,threshold,cost) VALUES($1,$2,$3,$4,$5,$6)",
        [ingredientId, r, a.name, a.unit, a.threshold, a.cost],
      );
      await log(db, r, user.id, "Ingrédient créé", ingredientId);
      return { id: ingredientId };
    }
    case "purchase":
      requirePermission(user.roles ?? user.role, "purchases");
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
      await db.query(
        "INSERT INTO supplier_ingredients(supplier_id,ingredient_id,restaurant_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [a.supplier, a.ingredient, r],
      );
      break;
    case "receive": {
      requirePermission(user.roles ?? user.role, "purchases");
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
      requirePermission(user.roles ?? user.role, "team");
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
    case "addMember": {
      if (!(user.roles ?? [user.role]).includes("OWNER"))
        throw new Error("Seul un administrateur peut ajouter une personne.");
      await db.query("SELECT app.add_team_member($1,$2,$3,$4,$5::jsonb)", [
        r,
        `staff:${uuid()}`,
        a.name,
        a.email ?? "",
        JSON.stringify([a.role]),
      ]);
      await notify(db, r, `${a.name} a rejoint l’équipe`);
      break;
    }
    case "deleteShift":
      requirePermission(user.roles ?? user.role, "team");
      await db.query("DELETE FROM shifts WHERE id=$1 AND restaurant_id=$2", [
        a.id,
        r,
      ]);
      break;
    case "clock": {
      await requirePaidAddon(db,r,"attendance");
      const latest = await rows<{ event: string }>(
        db,
        "SELECT event FROM time_entries WHERE profile_id=$1 AND restaurant_id=$2 AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1",
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
      requirePermission(user.roles ?? user.role, "finance");
      await db.query("INSERT INTO expenses VALUES($1,$2,$3,$4,now())", [
        uuid(),
        r,
        a.label,
        a.amount,
      ]);
      break;
    case "customer":
      requirePermission(user.roles ?? user.role, "customers");
      await db.query(
        "INSERT INTO customers(id,restaurant_id,name,contact,consent,points) VALUES($1,$2,$3,$4,$5,0)",
        [uuid(), r, a.name, a.contact, a.consent],
      );
      break;
    case "loyalty": {
      requirePermission(user.roles ?? user.role, "customers");
      await requirePaidAddon(db,r,"loyalty");
      const c = await one<{ points: number; consent: boolean }>(
        db,
        "SELECT *,coalesce(app.customer_points(id),points) AS points FROM customers WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
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
      requirePermission(user.roles ?? user.role, "catalog");
      await db.query(
        `UPDATE menu_items SET name=$3,price=$4,enabled=$5,description=$6,
          public_composition=coalesce($7,public_composition),
          allergens=coalesce($8,allergens),seo_title=coalesce($9,seo_title),
          seo_description=coalesce($10,seo_description)
         WHERE id=$1 AND restaurant_id=$2`,
        [
          a.id,
          r,
          a.name,
          a.price,
          a.enabled,
          a.description,
          a.public_composition ?? null,
          a.allergens ?? null,
          a.seo_title ?? null,
          a.seo_description ?? null,
        ],
      );
      break;
    case "recipe":
      requirePermission(user.roles ?? user.role, "catalog");
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
      requirePermission(user.roles ?? user.role, "settings");
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
        await db.query(
          "INSERT INTO restaurants(id,name,organization_id) SELECT $1,$2,organization_id FROM restaurants WHERE id=$3",
          [rid, a.name, r],
        );
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
export {
  reservationSchema,
  requestReservation,
} from "@/features/reservations/service";
