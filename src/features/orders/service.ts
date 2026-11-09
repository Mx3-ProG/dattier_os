import { requireCommercialCapability } from "@/features/platform/entitlements";
import { processPayment } from "@/features/finance/books";
import { mirrorAudit } from "@/features/ops-security/events";
import { redeemPromo } from "@/features/loyalty/service";
import { createHash, randomUUID as uuid } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
export const orderSchema = z.object({
  restaurant: z.string(),
  table: z.string().optional(),
  channel: z.enum(["staff", "takeaway", "qr"]).default("staff"),
  customer: z.string().max(100).default(""),
  contact: z.string().max(150).default(""),
  desiredAt: z.string().datetime().optional(),
  key: z.string().min(8).max(100),
  items: z
    .array(
      z.object({
        menu: z.string(),
        quantity: z.number().int().min(1).max(50),
        note: z.string().max(300).default(""),
      }),
    )
    .min(1)
    .max(40),
});
export async function log(
  db: DB,
  r: string,
  actor: string | null,
  action: string,
  object: string | null = null,
) {
  await db.query("INSERT INTO audit_logs VALUES($1,$2,$3,$4,$5,now())", [
    uuid(),
    r,
    actor,
    action,
    object,
  ]);
  await mirrorAudit(db, r, actor, action, object);
}
export async function notify(db: DB, r: string, message: string) {
  await db.query("INSERT INTO notifications VALUES($1,$2,$3,now())", [
    uuid(),
    r,
    message,
  ]);
}
export async function movement(
  db: DB,
  r: string,
  lot: string,
  qty: number,
  type: string,
  reason: string,
  actor: string | null,
  reference: string,
) {
  await db.query(
    "INSERT INTO stock_movements VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())",
    [uuid(), r, lot, qty, type, reason, actor, reference],
  );
}
export async function reserve(
  db: DB,
  r: string,
  itemId: string,
  menu: string,
  quantity: number,
  actor: string | null,
  choices: string[] = [],
) {
  await one(
    db,
    "SELECT id FROM menu_items WHERE id=$1 AND restaurant_id=$2 AND enabled=true AND archived_at IS NULL",
    [menu, r],
  );
  const recipe = await rows<{ ingredient_id: string; quantity: number }>(
    db,
    "SELECT ingredient_id,sum(quantity)::float AS quantity FROM (SELECT ingredient_id,quantity FROM recipe_ingredients WHERE menu_id=$1 UNION ALL SELECT ingredient_id,quantity FROM option_recipes WHERE menu_id=$1 AND choice_id=ANY($2::text[])) recipe GROUP BY ingredient_id ORDER BY ingredient_id",
    [menu, choices],
  );
  if (!recipe.length) throw new Error("Recette non configurée.");
  for (const ingredient of recipe) {
    let needed = ingredient.quantity * quantity;
    const lots = await rows<{ id: string; available: number }>(
      db,
      "SELECT id,(quantity-reserved)::float AS available FROM stock_lots WHERE ingredient_id=$1 AND expires_on>=CURRENT_DATE AND quantity>reserved ORDER BY expires_on,id FOR UPDATE",
      [ingredient.ingredient_id],
    );
    for (const lot of lots) {
      const take = Math.min(needed, lot.available);
      if (take <= 0) continue;
      await db.query("UPDATE stock_lots SET reserved=reserved+$2 WHERE id=$1", [
        lot.id,
        take,
      ]);
      await db.query(
        "INSERT INTO stock_reservations(id,item_id,lot_id,quantity) VALUES($1,$2,$3,$4)",
        [uuid(), itemId, lot.id, take],
      );
      await movement(
        db,
        r,
        lot.id,
        take,
        "reservation",
        "Commande validée",
        actor,
        itemId,
      );
      needed -= take;
      if (needed <= 0.000001) break;
    }
    if (needed > 0.000001)
      throw new Error("Stock insuffisant. La commande n’a pas été créée.");
  }
}
export async function createOrder(
  db: DB,
  input: z.infer<typeof orderSchema>,
  user: Actor | null,
) {
  if (input.channel === "staff") {
    if (!user) throw new Error("Connexion requise.");
    requirePermission(user.roles ?? user.role, "orders");
  } else if (!input.customer.trim() || !input.contact.trim())
    throw new Error("Nom et coordonnées requis.");
  const { locked } = await one<{ locked: boolean }>(
    db,
    "SELECT app.lock_restaurant_for_order($1) AS locked",
    [input.restaurant],
  );
  if (!locked) throw new Error("Établissement non autorisé.");
  await requireCommercialCapability(db, input.restaurant, input.channel === "staff" ? "operations" : "online-orders");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const prior = await rows<{
    id: string;
    restaurant_id: string;
    request_hash: string | null;
  }>(
    db,
    "SELECT id,restaurant_id,request_hash FROM orders WHERE idempotency_key=$1 AND restaurant_id=$2",
    [input.key, input.restaurant],
  );
  if (prior.length) {
    if (prior[0].restaurant_id !== input.restaurant)
      throw new Error("Clé déjà utilisée.");
    if (prior[0].request_hash && prior[0].request_hash !== fingerprint)
      throw new Error("Clé déjà utilisée pour une autre commande.");
    return prior[0].id;
  }
  if (input.channel === "takeaway" && input.table)
    throw new Error(
      "Une commande à emporter ne peut pas être rattachée à une table.",
    );
  let session: string | null = null;
  if (input.table) {
    const table = await one<{
      id: string;
      status: string;
      archived_at: string | null;
    }>(
      db,
      "SELECT * FROM dining_tables WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
      [input.table, input.restaurant],
    );
    if (table.archived_at || ["unavailable", "cleaning"].includes(table.status))
      throw new Error("Table indisponible.");
    const opened = await rows<{ id: string }>(
      db,
      "SELECT id FROM table_sessions WHERE table_id=$1 AND closed_at IS NULL",
      [table.id],
    );
    session = opened[0]?.id ?? null;
    if (!session && input.channel === "staff") {
      session = uuid();
      await db.query("INSERT INTO table_sessions(id,table_id) VALUES($1,$2)", [
        session,
        table.id,
      ]);
      await db.query("UPDATE dining_tables SET status='occupied' WHERE id=$1", [
        table.id,
      ]);
    }
    if (input.channel === "qr" && !session)
      throw new Error("Cette table n’a pas de service ouvert.");
  }
  if (["staff", "qr"].includes(input.channel) && !session)
    throw new Error("Sélectionnez une table.");
  const id = uuid();
  await db.query(
    "INSERT INTO orders(id,restaurant_id,session_id,channel,status,customer_name,contact,desired_at,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      id,
      input.restaurant,
      session,
      input.channel,
      input.channel === "staff" ? "active" : "pending",
      input.customer,
      input.contact,
      input.desiredAt ?? null,
      user?.id ?? null,
      input.key,
    ],
  );
  await db.query("UPDATE orders SET request_hash=$2 WHERE id=$1", [
    id,
    fingerprint,
  ]);
  for (const item of input.items) {
    const menu = await one<{ name: string; price: number; station: string }>(
      db,
      "SELECT * FROM menu_items WHERE id=$1 AND restaurant_id=$2 AND enabled=true AND archived_at IS NULL",
      [item.menu, input.restaurant],
    );
    const iid = uuid();
    const cost = await one<{ cost: number }>(
      db,
      "SELECT coalesce(sum(ri.quantity*i.cost),0)::float AS cost FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE menu_id=$1",
      [item.menu],
    );
    await db.query(
      "INSERT INTO order_items(id,order_id,menu_id,name,price,quantity,station,note,material_cost) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        iid,
        id,
        item.menu,
        menu.name,
        menu.price,
        item.quantity,
        menu.station,
        item.note,
        cost.cost,
      ],
    );
    if (input.channel === "staff")
      await reserve(
        db,
        input.restaurant,
        iid,
        item.menu,
        item.quantity,
        user?.id ?? null,
      );
  }
  await db.query("SELECT app.fin_freeze_order_vat($1)", [id]);
  await log(
    db,
    input.restaurant,
    user?.id ?? null,
    input.channel === "staff"
      ? "Commande créée · ingrédients réservés"
      : "Demande de commande à confirmer",
    id,
  );
  await notify(
    db,
    input.restaurant,
    `Nouvelle ${input.channel === "staff" ? "commande" : "demande à confirmer"} · ${id.slice(0, 6)}`,
  );
  return id;
}
/**
 * Une commande boutique peut être réglée avant d’être servie : elle reste
 * « active » pour la cuisine, puis passe à « paid » une fois tout servi ou annulé.
 */
export async function completeSettledOrder(db: DB, orderId: string) {
  await db.query(
    "UPDATE orders o SET status='paid' WHERE o.id=$1 AND o.status='active' AND EXISTS(SELECT 1 FROM shop_orders c WHERE c.order_id=o.id AND c.payment_status='paid') AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.status NOT IN ('served','cancelled'))",
    [orderId],
  );
}
export async function changeItem(
  db: DB,
  r: string,
  id: string,
  target: string,
  user: Actor,
) {
  const item = await one<{
    status: string;
    station: string;
    order_id: string;
    order_status: string;
  }>(
    db,
    "SELECT i.*,o.status AS order_status FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=$1 AND o.restaurant_id=$2 AND o.status IN ('active','paid') FOR UPDATE OF i",
    [id, r],
  );
  requirePermission(
    user.role,
    target === "served" || target === "cancelled"
      ? "orders"
      : item.station === "bar"
        ? "bar"
        : "kitchen",
  );
  if (item.status === target) return;
  if (item.order_status === "paid") throw new Error("Commande déjà réglée.");
  if (target === "cancelled" && ["served", "cancelled"].includes(item.status))
    throw new Error("Produit déjà servi ou annulé.");
  if (
    target !== "cancelled" &&
    !(
      {
        waiting: ["preparing"],
        preparing: ["ready"],
        ready: ["served"],
      } as Record<string, string[]>
    )[item.status]?.includes(target)
  )
    throw new Error("Transition de préparation impossible.");
  const reservations = await rows<{
    id: string;
    lot_id: string;
    quantity: number;
    status: string;
    expired: boolean;
  }>(
    db,
    "SELECT s.*,s.quantity::float,l.expires_on<CURRENT_DATE AS expired FROM stock_reservations s JOIN stock_lots l ON l.id=s.lot_id WHERE item_id=$1 FOR UPDATE",
    [id],
  );
  for (const reservation of reservations) {
    if (target === "preparing" && reservation.status === "reserved") {
      if (reservation.expired)
        throw new Error(
          "Lot expiré depuis la commande. Annulez puis recréez le produit.",
        );
      await db.query(
        "UPDATE stock_lots SET quantity=quantity-$2,reserved=reserved-$2 WHERE id=$1",
        [reservation.lot_id, reservation.quantity],
      );
      await db.query(
        "UPDATE stock_reservations SET status='consumed' WHERE id=$1",
        [reservation.id],
      );
      await movement(
        db,
        r,
        reservation.lot_id,
        -reservation.quantity,
        "consumption",
        "Début de préparation",
        user.id,
        id,
      );
    }
    if (target === "cancelled" && reservation.status === "reserved") {
      await db.query("UPDATE stock_lots SET reserved=reserved-$2 WHERE id=$1", [
        reservation.lot_id,
        reservation.quantity,
      ]);
      await db.query(
        "UPDATE stock_reservations SET status='released' WHERE id=$1",
        [reservation.id],
      );
      await movement(
        db,
        r,
        reservation.lot_id,
        -reservation.quantity,
        "release",
        "Annulation avant préparation",
        user.id,
        id,
      );
    } else if (target === "cancelled" && reservation.status === "consumed") {
      await db.query(
        "UPDATE stock_reservations SET status='wasted' WHERE id=$1",
        [reservation.id],
      );
      await movement(
        db,
        r,
        reservation.lot_id,
        0,
        "waste",
        `Annulation après consommation : ${reservation.quantity} unités déjà déduites`,
        user.id,
        id,
      );
    }
  }
  await db.query("UPDATE order_items SET status=$2 WHERE id=$1", [id, target]);
  await completeSettledOrder(db, item.order_id);
  await log(db, r, user.id, `Préparation : ${target}`, id);
  if (target === "ready")
    await notify(
      db,
      r,
      `${item.station === "bar" ? "Boisson" : "Plat"} prêt · commande ${item.order_id.slice(0, 6)}`,
    );
}
export async function pay(
  db: DB,
  r: string,
  orderId: string,
  method: string,
  user: Actor,
  customer?: string,
  promo?: string,
) {
  requirePermission(user.roles ?? user.role, "payments");
  const order = await one<{ session_id: string | null; status: string }>(
    db,
    "SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [orderId, r],
  );
  if (
    (
      await rows(db, "SELECT order_id FROM shop_orders WHERE order_id=$1", [
        orderId,
      ])
    ).length
  )
    throw new Error(
      "Utilisez le règlement de la boutique pour cette commande.",
    );
  if (order.status === "paid") return;
  if (order.status !== "active") throw new Error("Commande non réglable.");
  const items = await rows<{ status: string; price: number; quantity: number }>(
    db,
    order.session_id
      ? "SELECT i.* FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.session_id=$1 AND o.status='active'"
      : "SELECT * FROM order_items WHERE order_id=$1",
    [order.session_id ?? orderId],
  );
  if (items.some((i) => !["served", "cancelled"].includes(i.status)))
    throw new Error("Servez ou annulez tous les produits avant le règlement.");
  const total = items
    .filter((i) => i.status !== "cancelled")
    .reduce((s, i) => s + i.price * i.quantity, 0);
  if (customer)
    await one(db, "SELECT id FROM customers WHERE id=$1 AND restaurant_id=$2", [
      customer,
      r,
    ]);
  if (promo && !customer)
    throw new Error("Sélectionnez le client titulaire du code.");
  const reward = promo
    ? await redeemPromo(db, r, customer!, promo, total)
    : null;
  const net = total - (reward?.discount ?? 0);
  const declaration = uuid();
  if (total > 0)
    await db.query(
      "INSERT INTO payment_declarations(id,session_id,order_id,amount,method,actor,customer_id,promo_id,discount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        declaration,
        order.session_id,
        order.session_id ? null : orderId,
        net,
        method,
        user.id,
        customer || null,
        reward?.id ?? null,
        reward?.discount ?? 0,
      ],
    );
  await db.query(
    order.session_id
      ? "UPDATE orders SET status=$2 WHERE session_id=$1 AND status='active'"
      : "UPDATE orders SET status=$2 WHERE id=$1",
    [order.session_id ?? orderId, total ? "paid" : "cancelled"],
  );
  if (order.session_id) {
    await db.query("UPDATE table_sessions SET closed_at=now() WHERE id=$1", [
      order.session_id,
    ]);
    await db.query(
      "UPDATE dining_tables SET status='cleaning' WHERE id=(SELECT table_id FROM table_sessions WHERE id=$1)",
      [order.session_id],
    );
  }
  if (total > 0) await processPayment(db, r, declaration);
  await log(
    db,
    r,
    user.id,
    `Règlement déclaré : ${net / 100} EUR · ${method} · remise ${(reward?.discount ?? 0) / 100} EUR`,
    orderId,
  );
}
