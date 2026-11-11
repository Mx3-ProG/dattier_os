import { observeStaffFloor } from "@/features/floor/capabilities";
import { restaurantPlan } from "@/features/platform/entitlements";
import {
  messagingProviders,
  recentMessages,
} from "@/features/messaging/service";
import { registerPresence } from "@/features/ops-security/presence";
import { type DB, rows, one, demoEnabled } from "./database/db";
import { type Actor, scope } from "./auth/session";
import { can } from "./permissions";
import { canArrange } from "@/features/floor/access";
import { moduleEnabled } from "@/features/modules/access";
import { availableModules } from "@/features/modules/availability";
import { readModuleDisplay } from "@/features/modules/service";
import { tableQuota } from "@/features/floor/service";
import type { Snapshot, MenuItem, Restaurant, Order, Item } from "./types";
import {
  adminFlashPromotions,
  engagementSettings,
} from "@/features/commerce/engagement";
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
  await registerPresence(db, r, user);
  const plan = await restaurantPlan(db, r);
  const activeModules = {
    floor: await moduleEnabled(db, r, "floor"),
    "table-booking": await moduleEnabled(db, r, "table-booking"),
  };
  const paidAddons=(await rows<{addon:string}>(db,
    `SELECT addon FROM unnest(ARRAY['invoices','attendance','client-invoices','payroll',
      'offline-conflicts','connections','qr','loyalty','domain',
      'prospect-scanner','pipeline-crm','customer-health','email-automation']) AS addon
     WHERE app.addon_installed($1,addon)`,[r])).map(row=>row.addon);
  const allowed = (p: Parameters<typeof can>[1]) =>
    (p === "customers" ? paidAddons.includes("loyalty") :
      p === "payroll" ? paidAddons.includes("payroll") :
      plan >= 39 || !["finance", "website"].includes(p)) &&
    can(user.roles ?? user.role, p);
  const floorVisible =
    activeModules.floor &&
    observeStaffFloor(
      "floor.view",
      user.roles ?? [user.role],
      allowed("orders") || allowed("reservations"),
    );
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
          `SELECT o.id,o.status,o.channel,o.created_at,o.session_id,${allowed("orders") ? "o.customer_name,o.contact" : "'' AS customer_name"},t.number AS table_number,pd.amount AS payment_amount,pd.discount FROM orders o LEFT JOIN table_sessions s ON s.id=o.session_id LEFT JOIN dining_tables t ON t.id=s.table_id LEFT JOIN payment_declarations pd ON pd.order_id=o.id OR pd.session_id=o.session_id WHERE o.restaurant_id=$1 AND NOT EXISTS(SELECT 1 FROM shop_orders so WHERE so.order_id=o.id AND so.payment_method='stripe' AND so.payment_status<>'paid') ORDER BY o.created_at DESC LIMIT 150`,
          [r],
        )
      : [];
  const items = orders.length
    ? await rows<Item>(
        db,
        `SELECT i.id,i.order_id,i.name,i.price,i.quantity,i.station,i.status,i.note ${allowed("finance") ? ",i.material_cost::float" : ""} FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.restaurant_id=$1 AND o.id=ANY($2::text[])`,
        [r, orders.map((o) => o.id)],
      )
    : [];
  for (const order of orders)
    order.items = items.filter((i) => i.order_id === order.id);
  return {
    activeModules,
    // Décision commerciale unique (app.module_available) : la navigation ne lit plus que ce champ.
    modules: await availableModules(db, r),
    // Choix d’affichage du tableau de bord : présentation seulement, jamais une autorisation.
    moduleDisplay: await readModuleDisplay(db, r),
    uninstalledAddons: (await rows<{ addon_id: string }>(db,
      "SELECT addon_id FROM addon_installations WHERE restaurant_id=$1 AND NOT installed", [r],
    )).map((row) => row.addon_id),
    addons: paidAddons,
    // Licences d’add-ons de mesure : la RLS limite déjà la lecture à l’établissement ouvert.
    licenses: (
      await rows<{ product_id: string; kind: string }>(
        db,
        "SELECT l.product_id,p.kind FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id WHERE l.restaurant_id=$1 AND p.kind IN ('analytics','estimation','business') AND app.addon_installed($1,l.product_id)",
        [r],
      )
    ).flatMap((license) =>
      // Les outils métier partagent une seule entrée de menu : « Outils métier ».
      license.kind === "business" ? [license.product_id, "trade-tools"] : [license.product_id],
    ).filter((id, index, all) => all.indexOf(id) === index),
    demo: demoEnabled(),
    categories: (
      await rows<{ category: string }>(
        db,
        "SELECT jsonb_array_elements_text(config->'categories') AS category FROM shop_settings WHERE restaurant_id=$1",
        [r],
      )
    ).map((x) => x.category),
    now: new Date().toISOString(),
    user,
    restaurants,
    restaurant: await one(db, "SELECT * FROM restaurants WHERE id=$1", [r]),
    menu: await menu(db, r, allowed("finance"), allowed("catalog")),
    tables: floorVisible
      ? await rows(
          db,
          "SELECT * FROM dining_tables WHERE restaurant_id=$1 ORDER BY number",
          [r],
        )
      : [],
    zones: floorVisible
      ? await rows(
          db,
          "SELECT id,name,position FROM floor_zones WHERE restaurant_id=$1 ORDER BY position,created_at",
          [r],
        )
      : [],
    floorPlan: {
      canArrange: await canArrange(db, r, user),
      ...(await tableQuota(db, r)),
    },
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
    reservations:
      activeModules["table-booking"] && allowed("reservations")
        ? await rows(
            db,
            "SELECT * FROM reservations WHERE restaurant_id=$1 ORDER BY starts_at",
            [r],
          )
        : [],
    notifications: await rows(
      db,
      "SELECT n.*,EXISTS(SELECT 1 FROM notification_reads nr WHERE nr.notification_id=n.id AND nr.profile_id=$2) AS read FROM notifications n WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 40",
      [r, user.id],
    ),
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
          "SELECT s.*,coalesce((SELECT array_agg(si.ingredient_id ORDER BY si.ingredient_id) FROM supplier_ingredients si WHERE si.supplier_id=s.id),'{}') AS ingredient_ids FROM suppliers s WHERE s.restaurant_id=$1 ORDER BY s.name",
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
      `SELECT t.*,p.name FROM time_entries t JOIN profiles p ON p.id=t.profile_id WHERE restaurant_id=$1 AND t.voided_at IS NULL ${allowed("team") ? "" : "AND profile_id=$2"} ORDER BY created_at DESC LIMIT 50`,
      allowed("team") ? [r] : [r, user.id],
    ),
    plan,
    promos: allowed("customers")
      ? await rows(
          db,
          "SELECT p.*,c.name AS customer_name,p.expires_on<CURRENT_DATE AS expired FROM promo_codes p JOIN customers c ON c.id=p.customer_id WHERE p.restaurant_id=$1 ORDER BY p.created_at DESC",
          [r],
        )
      : [],
    engagement: allowed("customers") ? await engagementSettings(db, r) : null,
    flashPromotions:
      plan >= 39 && can(user.roles ?? user.role, "catalog")
        ? await adminFlashPromotions(db, r)
        : [],
    checkoutCustomers:
      plan >= 39 && allowed("payments")
        ? await rows(
            db,
            "SELECT id,name FROM customers WHERE restaurant_id=$1 ORDER BY name",
            [r],
          )
        : [],
    customers: allowed("customers")
      ? await rows(
          db,
          `SELECT c.*,coalesce(app.customer_points(c.id),c.points) AS points,oc.email AS account_email,
            coalesce(oc.marketing_consent,false) AS marketing_consent,
            (SELECT max(m.created_at) FROM customer_messages m WHERE m.customer_id=c.id AND m.status<>'error') AS last_message_at
           FROM customers c LEFT JOIN organization_customers oc ON oc.id=c.account_id WHERE c.restaurant_id=$1 ORDER BY c.name`,
          [r],
        )
      : [],
    customerMessages: allowed("customers") ? await recentMessages(db, r) : [],
    messaging: messagingProviders(),
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
