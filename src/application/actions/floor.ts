import { rows, one, type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import { can, requirePermission } from "@/core/permissions";
import {
  saveTable,
  moveTable,
  rotateTable,
  tableLifecycle,
  saveZone,
  moveZone,
  deleteZone,
} from "@/features/floor/service";
import { moduleEnabled, requireModule } from "@/features/modules/access";
import { observeStaffFloor } from "@/features/floor/capabilities";
import { awardBookingPoints } from "@/features/commerce/engagement";
import { actionSchema } from "./schema";

type Action = import("zod").infer<typeof actionSchema>;

export async function performFloorAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
    case "saveTable":
      return saveTable(db, r, user, a);
    case "moveTable":
      return moveTable(db, r, user, a.id, a.x, a.y);
    case "rotateTable":
      return rotateTable(db, r, user, a.id, a.rotation);
    case "tableLifecycle":
      return tableLifecycle(db, r, user, a.id, a.operation);
    case "saveZone":
      return saveZone(db, r, user, a);
    case "moveZone":
      return moveZone(db, r, user, a.id, a.direction);
    case "deleteZone":
      return deleteZone(db, r, user, a.id);
    case "table": {
      await requireModule(db, r, "floor");
      observeStaffFloor(
        "floor.status",
        user.roles ?? [user.role],
        can(user.roles ?? user.role, "orders"),
      );
      requirePermission(user.roles ?? user.role, "orders");
      const t = await one<{ status: string }>(
        db,
        "SELECT status FROM dining_tables WHERE id=$1 AND restaurant_id=$2",
        [a.id, r],
      );
      if (t.status === "occupied")
        throw new Error("Clôturez d’abord le service de cette table.");
      await db.query("UPDATE dining_tables SET status=$2 WHERE id=$1", [
        a.id,
        a.status,
      ]);
      break;
    }
    case "reservation": {
      await requireModule(db, r, "table-booking");
      observeStaffFloor(
        "table-booking.manage",
        user.roles ?? [user.role],
        can(user.roles ?? user.role, "reservations"),
      );
      requirePermission(user.roles ?? user.role, "reservations");
      const res = await one<{
        status: string;
        table_id: string | null;
        guests: number;
        starts_at: string;
        ends_at: string;
      }>(
        db,
        "SELECT * FROM reservations WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [a.id, r],
      );
      const transitions: Record<string, string[]> = {
        requested: ["confirmed", "declined", "cancelled"],
        confirmed: ["confirmed", "arrived", "cancelled", "no_show"],
        arrived: ["cancelled"],
      };
      if (!transitions[res.status]?.includes(a.status))
        throw new Error("Transition de réservation impossible.");
      const floor = await moduleEnabled(db, r, "floor");
      if (a.table && !floor)
        throw new Error("Activez le plan de salle pour attribuer une table.");
      const table = a.table || res.table_id;
      // Sans plan de salle, la réservation se confirme sans table (lot P1-a3).
      if (["confirmed", "arrived"].includes(a.status) && (floor || table)) {
        if (!table) throw new Error("Affectez une table.");
        const t = await one<{ capacity: number; status: string }>(
          db,
          "SELECT * FROM dining_tables WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL",
          [table, r],
        );
        if (
          t.capacity < res.guests ||
          t.status === "unavailable" ||
          (a.status === "arrived" && t.status !== "free")
        )
          throw new Error("Capacité ou état de table incompatible.");
        const conflicts = await rows(
          db,
          "SELECT id FROM reservations WHERE table_id=$1 AND id<>$2 AND status IN ('requested','confirmed','arrived') AND starts_at<$3 AND ends_at>$4",
          [table, a.id, res.ends_at, res.starts_at],
        );
        if (conflicts.length)
          throw new Error("Cette table est déjà réservée sur ce créneau.");
      }
      await db.query(
        "UPDATE reservations SET status=$2,table_id=$3 WHERE id=$1",
        [a.id, a.status, table],
      );
      if (a.status === "arrived") await awardBookingPoints(db, r, a.id);
      break;
    }
  }
}
