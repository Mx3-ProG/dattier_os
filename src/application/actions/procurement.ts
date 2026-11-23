import { one, type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import { can, requirePermission, type Permission } from "@/core/permissions";
import { randomUUID as uuid } from "node:crypto";
import { movement, notify, log } from "@/features/orders/service";
import { actionSchema } from "./schema";

type Action = import("zod").infer<typeof actionSchema>;

export async function performProcurementAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
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
  }
}
