import { rows, one, type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { randomUUID as uuid } from "node:crypto";
import { notify } from "@/features/orders/service";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { actionSchema } from "./schema";

type Action = import("zod").infer<typeof actionSchema>;

export async function performHrAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
    case "shift": {
      requirePermission(user.roles ?? user.role, "team");
      await one(
        db,
        "SELECT profile_id FROM memberships WHERE profile_id=$1 AND restaurant_id=$2",
        [a.profile, r],
      );
      if (a.start >= a.end) throw new Error("Horaire de fin invalide.");
      if (
        (
          await rows(
            db,
            "SELECT id FROM shifts WHERE profile_id=$1 AND starts_at<$2 AND ends_at>$3",
            [a.profile, a.end, a.start],
          )
        ).length
      )
        throw new Error("Créneau en conflit.");
      await db.query("INSERT INTO shifts VALUES($1,$2,$3,$4,$5)", [
        uuid(),
        r,
        a.profile,
        a.start,
        a.end,
      ]);
      await notify(db, r, "Planning mis à jour");
      break;
    }
    case "deleteShift":
      requirePermission(user.roles ?? user.role, "team");
      await db.query("DELETE FROM shifts WHERE id=$1 AND restaurant_id=$2", [
        a.id,
        r,
      ]);
      break;
    case "clock": {
      await requirePaidAddon(db,r,"attendance");
      const latest = await rows<{ event: string }>(
        db,
        "SELECT event FROM time_entries WHERE profile_id=$1 AND restaurant_id=$2 AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1",
        [user.id, r],
      );
      const prev = latest[0]?.event ?? "end";
      if (
        !(
          {
            end: ["start"],
            start: ["break", "end"],
            break: ["resume", "end"],
            resume: ["break", "end"],
          } as Record<string, string[]>
        )[prev].includes(a.event)
      )
        throw new Error("Pointage incompatible avec votre état actuel.");
      await db.query("INSERT INTO time_entries VALUES($1,$2,$3,$4,now())", [
        uuid(),
        r,
        user.id,
        a.event,
      ]);
      break;
    }
  }
}
