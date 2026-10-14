import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log } from "@/features/orders/service";
export const productSchema = z.object({
  action: z.literal("createProduct"),
  name: z.string().trim().min(1).max(150),
  category: z.enum(["Entrées", "Plats", "Desserts", "Boissons"]),
  price: z.coerce.number().int().min(0).max(100000),
  station: z.enum(["kitchen", "bar"]),
  description: z.string().max(500).default(""),
  ingredients: z
    .array(
      z.object({
        id: z.string().min(1),
        quantity: z.coerce.number().positive().max(100000),
      }),
    )
    .min(1)
    .max(50),
});
export async function createProduct(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof productSchema>,
) {
  requirePermission(user.role, "catalog");
  if (new Set(a.ingredients.map((i) => i.id)).size !== a.ingredients.length)
    throw new Error("Chaque ingrédient doit apparaître une seule fois.");
  for (const i of a.ingredients)
    await one(
      db,
      "SELECT id FROM ingredients WHERE id=$1 AND restaurant_id=$2",
      [i.id, r],
    );
  const id = randomUUID();
  await db.query(
    "INSERT INTO menu_items(id,restaurant_id,name,category,price,station,description) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, r, a.name, a.category, a.price, a.station, a.description],
  );
  for (const i of a.ingredients)
    await db.query("INSERT INTO recipe_ingredients VALUES($1,$2,$3)", [
      id,
      i.id,
      i.quantity,
    ]);
  await log(db, r, user.id, "Produit créé avec sa recette", id);
  return id;
}
export async function lifecycle(
  db: DB,
  r: string,
  user: Actor,
  id: string,
  operation: "archive" | "restore" | "delete",
) {
  requirePermission(user.role, "catalog");
  await one(
    db,
    "SELECT id FROM menu_items WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [id, r],
  );
  if (operation === "delete") {
    if (
      (
        await rows(db, "SELECT id FROM order_items WHERE menu_id=$1 LIMIT 1", [
          id,
        ])
      ).length
    )
      throw new Error(
        "Ce produit figure dans des commandes. Archivez-le pour préserver l’historique.",
      );
    await db.query("DELETE FROM recipe_ingredients WHERE menu_id=$1", [id]);
    await db.query("DELETE FROM menu_items WHERE id=$1", [id]);
  } else
    await db.query(
      `UPDATE menu_items SET archived_at=${operation === "archive" ? "now()" : "NULL"} WHERE id=$1`,
      [id],
    );
  await log(db, r, user.id, `Produit : ${operation}`, id);
}
