import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { enqueue } from "./jobs";
import { log } from "@/features/orders/service";
export async function securityAction(
  db: DB,
  r: string,
  user: Actor,
  raw: unknown,
) {
  requirePermission(user.roles ?? user.role, "settings");
  const a = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("incident"),
        id: z.string(),
        status: z.enum(["acknowledged", "resolved", "archived"]),
      }),
      z.object({ action: z.literal("archiveSecurity"), day: z.iso.date() }),
      z.object({ action: z.literal("scanSecurity") }),
    ])
    .parse(raw);
  if (a.action === "incident") {
    await db.query(
      "UPDATE security_incidents SET status=$3,updated_at=now() WHERE id=$1 AND restaurant_id=$2",
      [a.id, r, a.status],
    );
    await log(db, r, user.id, "Incident de sécurité traité", a.id);
    return { updated: true };
  }
  if (a.action === "archiveSecurity") {
    if (a.day >= new Date().toISOString().slice(0, 10))
      throw new Error("Archivez uniquement une journée terminée.");
    await enqueue(db, r, "security_archive", a.day, { day: a.day });
    await log(db, r, user.id, "Archivage sécurité demandé");
    return { queued: true };
  }
  const failed = await rows<{ id: string }>(
    db,
    "SELECT id FROM outbox_jobs WHERE restaurant_id=$1 AND status='failed' LIMIT 1",
    [r],
  );
  const rules = [
    {
      rule: "failed-jobs",
      active: failed.length > 0,
      message:
        "Une tâche a épuisé ses tentatives ; consultez les erreurs avant relance.",
    },
  ];
  for (const rule of rules) {
    if (rule.active)
      await db.query(
        "INSERT INTO security_incidents(id,restaurant_id,rule,message) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,rule) DO UPDATE SET status=CASE WHEN security_incidents.status='archived' THEN 'open' ELSE security_incidents.status END,message=excluded.message,updated_at=now()",
        [randomUUID(), r, rule.rule, rule.message],
      );
  }
  await log(db, r, user.id, "Contrôles de sécurité exécutés");
  return { checked: true };
}
