import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, one, type DB } from "@/infrastructure/database/db";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { requirePermission, can } from "@/core/permissions";
import { movement, log } from "@/features/orders/service";
const id = z.string().min(1).max(150),
  qty = z.number().positive().max(1000000),
  name = z.string().trim().min(1).max(150);
export const inventoryAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ingredient"),
    name,
    unit: z.enum(["g", "ml", "unit"]),
    threshold: z.number().min(0),
    cost: z.number().min(0),
  }),
  z.object({
    action: z.literal("conversion"),
    from: name,
    to: z.enum(["g", "ml", "unit"]),
    factor: qty,
  }),
  z.object({
    action: z.literal("optionRecipe"),
    menu: id,
    choice: id,
    ingredient: id,
    quantity: qty,
  }),
  z.object({
    action: z.literal("inventory"),
    lines: z
      .array(z.object({ lot: id, counted: z.number().min(0).max(1000000) }))
      .min(1)
      .max(200),
  }),
  z.object({ action: z.literal("applyInventory"), id }),
  z.object({ action: z.literal("cancelInventory"), id }),
  z.object({
    action: z.literal("purchase"),
    supplier: id,
    due: z.iso.date(),
    lines: z
      .array(z.object({ ingredient: id, quantity: qty, unit: name }))
      .min(1)
      .max(100),
  }),
  z.object({ action: z.literal("confirmPurchase"), id }),
  z.object({ action: z.literal("cancelPurchase"), id }),
  z.object({
    action: z.literal("receivePurchase"),
    line: id,
    quantity: qty,
    expires: z.iso.date(),
    location: name,
  }),
  z.object({
    action: z.literal("transfer"),
    lot: id,
    quantity: qty,
    location: name,
  }),
]);
export async function inventoryState(db: DB, r: string, user: Actor) {
  user = await scope(db, user, r);
  if (
    !can(user.roles ?? user.role, "stock") &&
    !can(user.roles ?? user.role, "purchases")
  )
    throw new Error("Accès refusé.");
  return {
    inventories: await rows(
      db,
      "SELECT s.*,count(l.lot_id)::int AS lines FROM inventory_sessions s LEFT JOIN inventory_lines l ON l.session_id=s.id WHERE s.restaurant_id=$1 GROUP BY s.id ORDER BY created_at DESC LIMIT 100",
      [r],
    ),
    purchases: await rows(
      db,
      "SELECT p.*,s.name AS supplier FROM purchase_documents p JOIN suppliers s ON s.id=p.supplier_id WHERE p.restaurant_id=$1 ORDER BY created_at DESC LIMIT 100",
      [r],
    ),
    lines: await rows(
      db,
      "SELECT l.*,i.name,i.unit FROM purchase_document_lines l JOIN purchase_documents p ON p.id=l.document_id JOIN ingredients i ON i.id=l.ingredient_id WHERE p.restaurant_id=$1 ORDER BY p.created_at DESC LIMIT 500",
      [r],
    ),
    conversions: await rows(
      db,
      "SELECT * FROM unit_conversions WHERE restaurant_id=$1",
      [r],
    ),
  };
}
export async function inventoryPerform(
  db: DB,
  r: string,
  user: Actor,
  raw: unknown,
) {
  user = await scope(db, user, r);
  const a = inventoryAction.parse(raw);
  requirePermission(
    user.roles ?? user.role,
    a.action.includes("Purchase") || a.action === "purchase"
      ? "purchases"
      : "stock",
  );
  if (a.action === "ingredient") {
    requirePermission(user.roles ?? user.role, "catalog");
    const iid = randomUUID();
    await db.query(
      "INSERT INTO ingredients(id,restaurant_id,name,unit,threshold,cost) VALUES($1,$2,$3,$4,$5,$6)",
      [iid, r, a.name, a.unit, a.threshold, a.cost],
    );
    await log(db, r, user.id, "Ingrédient créé", iid);
    return { id: iid };
  }
  if (a.action === "conversion") {
    requirePermission(user.roles ?? user.role, "catalog");
    if (a.from === a.to) throw new Error("Unités identiques.");
    await db.query(
      "INSERT INTO unit_conversions VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,from_unit,to_unit) DO UPDATE SET factor=excluded.factor",
      [r, a.from, a.to, a.factor],
    );
    await log(db, r, user.id, "Conversion enregistrée");
    return { saved: true };
  }
  if (a.action === "optionRecipe") {
    requirePermission(user.roles ?? user.role, "catalog");
    const product = await one<{
      options: { id: string; choices: { id: string }[] }[];
    }>(db, "SELECT options FROM menu_items WHERE id=$1 AND restaurant_id=$2", [
      a.menu,
      r,
    ]);
    if (
      !product.options.some((g) =>
        g.choices.some((c) => `${g.id}:${c.id}` === a.choice),
      )
    )
      throw new Error("Option inconnue.");
    await one(
      db,
      "SELECT id FROM ingredients WHERE id=$1 AND restaurant_id=$2",
      [a.ingredient, r],
    );
    await db.query(
      "INSERT INTO option_recipes VALUES($1,$2,$3,$4) ON CONFLICT(menu_id,choice_id,ingredient_id) DO UPDATE SET quantity=excluded.quantity",
      [a.menu, a.choice, a.ingredient, a.quantity],
    );
    await log(db, r, user.id, "Recette de supplément enregistrée", a.menu);
    return { saved: true };
  }
  if (a.action === "inventory") {
    if (new Set(a.lines.map((l) => l.lot)).size !== a.lines.length)
      throw new Error("Lot en double.");
    const iid = randomUUID();
    await db.query(
      "INSERT INTO inventory_sessions(id,restaurant_id,created_by) VALUES($1,$2,$3)",
      [iid, r, user.id],
    );
    for (const l of a.lines) {
      await one(
        db,
        "SELECT l.id FROM stock_lots l JOIN ingredients i ON i.id=l.ingredient_id WHERE l.id=$1 AND i.restaurant_id=$2",
        [l.lot, r],
      );
      await db.query("INSERT INTO inventory_lines VALUES($1,$2,$3)", [
        iid,
        l.lot,
        l.counted,
      ]);
    }
    await log(db, r, user.id, "Inventaire enregistré en brouillon", iid);
    return { id: iid };
  }
  if (a.action === "applyInventory" || a.action === "cancelInventory") {
    if (
      !(user.roles ?? [user.role]).some((r) =>
        ["OWNER", "SUPER_ADMIN", "MANAGER", "STOCK_MANAGER"].includes(r),
      )
    )
      throw new Error("Accès refusé.");
    const doc = await one<{ status: string }>(
      db,
      "SELECT status FROM inventory_sessions WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
      [a.id, r],
    );
    if (doc.status !== "draft") throw new Error("Inventaire déjà traité.");
    if (a.action === "applyInventory") {
      const lines = await rows<{
        lot_id: string;
        counted: number;
        quantity: number;
        reserved: number;
      }>(
        db,
        "SELECT x.lot_id,x.counted::float,l.quantity::float,l.reserved::float FROM inventory_lines x JOIN stock_lots l ON l.id=x.lot_id WHERE x.session_id=$1 ORDER BY l.id FOR UPDATE OF l",
        [a.id],
      );
      for (const l of lines) {
        if (l.counted < l.reserved)
          throw new Error("Stock compté inférieur aux réservations.");
        await db.query("UPDATE stock_lots SET quantity=$2 WHERE id=$1", [
          l.lot_id,
          l.counted,
        ]);
        await movement(
          db,
          r,
          l.lot_id,
          l.counted - l.quantity,
          "inventory",
          "Campagne inventaire",
          user.id,
          a.id,
        );
      }
    }
    await db.query("UPDATE inventory_sessions SET status=$2 WHERE id=$1", [
      a.id,
      a.action === "applyInventory" ? "applied" : "cancelled",
    ]);
    await log(db, r, user.id, `Inventaire : ${a.action}`, a.id);
    return { updated: true };
  }
  if (a.action === "purchase") {
    await one(db, "SELECT id FROM suppliers WHERE id=$1 AND restaurant_id=$2", [
      a.supplier,
      r,
    ]);
    const pid = randomUUID();
    await db.query(
      "INSERT INTO purchase_documents(id,restaurant_id,supplier_id,due_on) VALUES($1,$2,$3,$4)",
      [pid, r, a.supplier, a.due],
    );
    for (const l of a.lines) {
      const ing = await one<{ unit: string }>(
        db,
        "SELECT unit FROM ingredients WHERE id=$1 AND restaurant_id=$2",
        [l.ingredient, r],
      );
      const factor =
        l.unit === ing.unit
          ? 1
          : (
              await one<{ factor: number }>(
                db,
                "SELECT factor::float FROM unit_conversions WHERE restaurant_id=$1 AND from_unit=$2 AND to_unit=$3",
                [r, l.unit, ing.unit],
              )
            ).factor;
      await db.query(
        "INSERT INTO purchase_document_lines(id,document_id,ingredient_id,quantity) VALUES($1,$2,$3,$4)",
        [randomUUID(), pid, l.ingredient, l.quantity * factor],
      );
    }
    await log(db, r, user.id, "Commande fournisseur en brouillon", pid);
    return { id: pid };
  }
  if (a.action === "confirmPurchase" || a.action === "cancelPurchase") {
    const p = await one<{ status: string }>(
      db,
      "SELECT status FROM purchase_documents WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
      [a.id, r],
    );
    if (a.action === "confirmPurchase" && p.status !== "draft")
      throw new Error("Commande déjà confirmée.");
    if (
      a.action === "cancelPurchase" &&
      !["draft", "confirmed", "partial"].includes(p.status)
    )
      throw new Error("Commande terminée.");
    await db.query("UPDATE purchase_documents SET status=$2 WHERE id=$1", [
      a.id,
      a.action === "confirmPurchase" ? "confirmed" : "cancelled",
    ]);
    await log(db, r, user.id, `Approvisionnement : ${a.action}`, a.id);
    return { updated: true };
  }
  if (a.action === "receivePurchase") {
    const line = await one<{
      document_id: string;
      ingredient_id: string;
      quantity: number;
      received: number;
      status: string;
    }>(
      db,
      "SELECT l.*,l.quantity::float,l.received::float,p.status FROM purchase_document_lines l JOIN purchase_documents p ON p.id=l.document_id WHERE l.id=$1 AND p.restaurant_id=$2 FOR UPDATE OF p,l",
      [a.line, r],
    );
    if (
      !["confirmed", "partial"].includes(line.status) ||
      a.quantity > line.quantity - line.received
    )
      throw new Error("Réception incompatible.");
    if (
      a.expires <
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
        new Date(),
      )
    )
      throw new Error("Lot expiré.");
    const lot = randomUUID();
    await db.query(
      "INSERT INTO stock_lots(id,ingredient_id,quantity,expires_on,location) VALUES($1,$2,$3,$4,$5)",
      [lot, line.ingredient_id, a.quantity, a.expires, a.location],
    );
    await db.query(
      "UPDATE purchase_document_lines SET received=received+$2 WHERE id=$1",
      [a.line, a.quantity],
    );
    const rest = await one<{ remaining: number }>(
      db,
      "SELECT sum(quantity-received)::float AS remaining FROM purchase_document_lines WHERE document_id=$1",
      [line.document_id],
    );
    await db.query("UPDATE purchase_documents SET status=$2 WHERE id=$1", [
      line.document_id,
      rest.remaining < 0.000001 ? "received" : "partial",
    ]);
    await movement(
      db,
      r,
      lot,
      a.quantity,
      "receipt",
      "Réception fournisseur multilignes",
      user.id,
      line.document_id,
    );
    await log(db, r, user.id, "Livraison réceptionnée", line.document_id);
    return { lot };
  }
  const lot = await one<{
    ingredient_id: string;
    quantity: number;
    reserved: number;
    expires_on: string;
    location: string;
  }>(
    db,
    "SELECT l.*,l.quantity::float,l.reserved::float FROM stock_lots l JOIN ingredients i ON i.id=l.ingredient_id WHERE l.id=$1 AND i.restaurant_id=$2 FOR UPDATE OF l",
    [a.lot, r],
  );
  if (a.quantity > lot.quantity - lot.reserved || a.location === lot.location)
    throw new Error("Transfert impossible.");
  const dest = randomUUID();
  await db.query("UPDATE stock_lots SET quantity=quantity-$2 WHERE id=$1", [
    a.lot,
    a.quantity,
  ]);
  await db.query(
    "INSERT INTO stock_lots(id,ingredient_id,quantity,expires_on,location) VALUES($1,$2,$3,$4,$5)",
    [dest, lot.ingredient_id, a.quantity, lot.expires_on, a.location],
  );
  await movement(
    db,
    r,
    a.lot,
    -a.quantity,
    "transfer",
    `Vers ${a.location}`,
    user.id,
    dest,
  );
  await movement(
    db,
    r,
    dest,
    a.quantity,
    "transfer",
    `Depuis ${lot.location}`,
    user.id,
    a.lot,
  );
  await log(db, r, user.id, "Transfert de stock", dest);
  return { lot: dest };
}
