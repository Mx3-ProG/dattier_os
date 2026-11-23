import { rows, one, type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import { changeItem, createOrder, pay, reserve } from "@/features/orders/service";
import { requirePermission } from "@/core/permissions";
import { actionSchema } from "./schema";
import { z as zod } from "zod";

type Action = zod.infer<typeof actionSchema>;

export async function performOrderAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
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
  }
}
