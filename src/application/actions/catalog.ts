import { one, type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import {
  createProduct,
  lifecycle,
} from "@/features/catalog/service";
import { requirePermission } from "@/core/permissions";
import { actionSchema } from "./schema";

type Action = import("zod").infer<typeof actionSchema>;

export async function performCatalogAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
    case "createProduct":
      return createProduct(db, r, user, a);
    case "productLifecycle":
      return lifecycle(db, r, user, a.id, a.operation);
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
  }
}
