import { type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { randomUUID as uuid } from "node:crypto";
import { actionSchema } from "./schema";

type Action = import("zod").infer<typeof actionSchema>;

export async function performExpenseAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
    case "expense":
      requirePermission(user.roles ?? user.role, "finance");
      await db.query("INSERT INTO expenses VALUES($1,$2,$3,$4,now())", [
        uuid(),
        r,
        a.label,
        a.amount,
      ]);
      break;
  }
}
