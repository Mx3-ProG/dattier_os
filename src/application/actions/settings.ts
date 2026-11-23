import { type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { randomUUID as uuid } from "node:crypto";
import { actionSchema } from "./schema";

type Action = import("zod").infer<typeof actionSchema>;

export async function performSettingsAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
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
}
