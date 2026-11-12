import { one, type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { randomUUID as uuid } from "node:crypto";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { actionSchema } from "./schema";

type Action = import("zod").infer<typeof actionSchema>;

export async function performCustomerAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
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
  }
}
