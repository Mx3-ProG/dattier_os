import { type DB, rows, one } from "./database/db";
import { type Actor, scope } from "./auth/session";
import { can } from "./permissions";
import {
  listNotifications,
  preferences,
} from "@/features/notifications/service";
import type { Snapshot, MenuItem, Restaurant, Order, Item } from "./types";
export async function menu(
  db: DB,
  r: string,
  financial = false,
  includeArchived = false,
) {
  return rows<MenuItem>(
    db,
    `SELECT m.*,coalesce((SELECT min(floor(coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=ri.ingredient_id AND l.expires_on>=CURRENT_DATE),0)/ri.quantity)) FROM recipe_ingredients ri WHERE ri.menu_id=m.id),0)::int AS portions ${financial ? ",(SELECT sum(ri.quantity*i.cost)::float FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE ri.menu_id=m.id) AS cost" : ""} FROM menu_items m WHERE m.restaurant_id=$1 ${includeArchived ? "" : "AND m.archived_at IS NULL"} ORDER BY m.category,m.name`,
    [r],
  );
}
export async function snapshot(
  db: DB,
  user: Actor,
  r: string,
): Promise<Snapshot> {
  user = await scope(db, user, r);
  const allowed = (p: Parameters<typeof can>[1]) => can(user, p);
  const restaurants = await rows<Restaurant>(
    db,
    "SELECT DISTINCT r.* FROM restaurants r JOIN memberships m ON m.restaurant_id=r.id WHERE m.profile_id=$1 ORDER BY r.id",
    [user.id],
  );
  const orders =
    allowed("orders") ||
    allowed("kitchen") ||
    allowed("bar") ||
    allowed("finance")
      ? await rows<Order>(
          db,
          `SELECT o.id,o.status,o.channel,o.created_at,o.session_id,${allowed("orders") ? "o.customer_name,o.contact" : "'' AS customer_name"},t.number AS table_number,pd.amount AS payment_amount,pd.discount FROM orders o LEFT JOIN table_sessions s ON s.id=o.session_id LEFT JOIN dining_tables t ON t.id=s.table_id LEFT JOIN payment_declarations pd ON pd.order_id=o.id OR pd.session_id=o.session_id WHERE o.restaurant_id=$1 ORDER BY o.created_at DESC LIMIT 150`,
          [r],
        )
      : [];
  const items = orders.length
    ? await rows<Item>(
        db,
        `SELECT i.id,i.order_id,i.name,i.price,i.quantity,i.station,i.status,i.note ${allowed("finance") ? ",i.material_cost::float" : ""} FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.restaurant_id=$1`,
        [r],
      )
    : [];
  for (const order of orders)
    order.items = items.filter((i) => i.order_id === order.id);
  const notices = await listNotifications(db, r, user);
  return {
    now: new Date().toISOString(),
    user,
    restaurants,
    restaurant: await one(db, "SELECT * FROM restaurants WHERE id=$1", [r]),
    menu: await menu(db, r, allowed("finance"), allowed("catalog")),
    tables:
      allowed("orders") || allowed("reservations")
        ? await rows(
            db,
            "SELECT * FROM dining_tables WHERE restaurant_id=$1 ORDER BY number",
            [r],
          )
        : [],
    orders,
    ingredients:
      allowed("stock") || allowed("purchases")
        ? await rows(
            db,
            `SELECT i.id,i.name,i.unit,i.threshold::float,coalesce(sum(l.quantity),0)::float AS physical,coalesce(sum(l.reserved),0)::float AS reserved,coalesce(sum(CASE WHEN l.expires_on>=CURRENT_DATE THEN l.quantity-l.reserved ELSE 0 END),0)::float AS available FROM ingredients i LEFT JOIN stock_lots l ON l.ingredient_id=i.id WHERE i.restaurant_id=$1 GROUP BY i.id ORDER BY i.name`,
            [r],
          )
        : [],
    lots: allowed("stock")
      ? await rows(
          db,
          "SELECT l.*,l.quantity::float,l.reserved::float,i.name,i.unit FROM stock_lots l JOIN ingredients i ON i.id=l.ingredient_id WHERE i.restaurant_id=$1 ORDER BY expires_on",
          [r],
        )
      : [],
    movements: allowed("stock")
      ? await rows(
          db,
          "SELECT m.*,m.quantity::float,i.name FROM stock_movements m JOIN stock_lots l ON l.id=m.lot_id JOIN ingredients i ON i.id=l.ingredient_id WHERE m.restaurant_id=$1 ORDER BY m.created_at DESC LIMIT 100",
          [r],
        )
      : [],
    reservations: allowed("reservations")
      ? await rows(
          db,
          "SELECT * FROM reservations WHERE restaurant_id=$1 ORDER BY starts_at",
          [r],
        )
      : [],
    notifications: notices.items,
    unreadNotifications: notices.unread,
    notificationPreferences: await preferences(db, r, user),
    audit: allowed("audit")
      ? await rows(
          db,
          "SELECT a.*,coalesce(p.name,'Visiteur') AS name FROM audit_logs a LEFT JOIN profiles p ON p.id=a.actor WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 100",
          [r],
        )
      : [],
    suppliers: allowed("purchases")
      ? await rows(
          db,
          "SELECT * FROM suppliers WHERE restaurant_id=$1 ORDER BY name",
          [r],
        )
      : [],
    purchases: allowed("purchases")
      ? await rows(
          db,
          "SELECT p.*,p.quantity::float,p.received::float,s.name,i.name AS ingredient_name,i.unit FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id JOIN ingredients i ON i.id=p.ingredient_id WHERE p.restaurant_id=$1 ORDER BY due_on",
          [r],
        )
      : [],
    employees: allowed("team")
      ? await rows(
          db,
          "SELECT DISTINCT p.* FROM profiles p JOIN memberships m ON m.profile_id=p.id WHERE m.restaurant_id=$1",
          [r],
        )
      : [],
    shifts: allowed("team")
      ? await rows(
          db,
          "SELECT s.*,p.name FROM shifts s JOIN profiles p ON p.id=s.profile_id WHERE restaurant_id=$1 ORDER BY starts_at",
          [r],
        )
      : [],
    timeEntries: await rows(
      db,
      `SELECT t.*,p.name FROM time_entries t JOIN profiles p ON p.id=t.profile_id WHERE restaurant_id=$1 ${allowed("team") ? "" : "AND profile_id=$2"} ORDER BY created_at DESC LIMIT 50`,
      allowed("team") ? [r] : [r, user.id],
    ),
    promos: allowed("customers")
      ? await rows(
          db,
          "SELECT p.*,c.name AS customer_name,p.expires_on<CURRENT_DATE AS expired FROM promo_codes p JOIN customers c ON c.id=p.customer_id WHERE p.restaurant_id=$1 ORDER BY p.created_at DESC",
          [r],
        )
      : [],
    checkoutCustomers: allowed("payments")
      ? await rows(
          db,
          "SELECT id,name FROM customers WHERE restaurant_id=$1 ORDER BY name",
          [r],
        )
      : [],
    customers: allowed("customers")
      ? await rows(db, "SELECT * FROM customers WHERE restaurant_id=$1", [r])
      : [],
    expenses: allowed("finance")
      ? await rows(
          db,
          "SELECT * FROM expenses WHERE restaurant_id=$1 ORDER BY created_at DESC",
          [r],
        )
      : [],
    recipes:
      allowed("stock") || allowed("catalog")
        ? await rows(
            db,
            "SELECT ri.*,ri.quantity::float,i.name,i.unit FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE i.restaurant_id=$1",
            [r],
          )
        : [],
    sales: allowed("finance")
      ? await rows(
          db,
          `SELECT to_char(p.created_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day,sum(p.amount)::int AS total FROM payment_declarations p LEFT JOIN table_sessions s ON s.id=p.session_id LEFT JOIN dining_tables t ON t.id=s.table_id LEFT JOIN orders o ON o.id=p.order_id WHERE coalesce(t.restaurant_id,o.restaurant_id)=$1 GROUP BY day ORDER BY day`,
          [r],
        )
      : [],
    payments: allowed("finance")
      ? await rows(
          db,
          "SELECT p.amount,p.created_at FROM payment_declarations p LEFT JOIN table_sessions s ON s.id=p.session_id LEFT JOIN dining_tables t ON t.id=s.table_id LEFT JOIN orders o ON o.id=p.order_id WHERE coalesce(t.restaurant_id,o.restaurant_id)=$1",
          [r],
        )
      : [],
  };
}
