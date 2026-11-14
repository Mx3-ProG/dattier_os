import { z } from "zod";
import { rows, type DB } from "@/lib/database/db";
import { requirePermission } from "@/lib/permissions";
import type { Actor } from "@/lib/auth/session";
import { staffSchemaReady } from "./pins";

/** Filtres de l’historique « qui fait quoi ». */
export const activityQuery = z.object({
  member: z.string().max(100).optional().catch(undefined),
  kind: z
    .enum(["order", "payment", "cancel_item", "confirm_order", "decline_order", "pin"])
    .optional()
    .catch(undefined),
  days: z.coerce.number().int().min(1).max(90).catch(7),
});

export type StaffActivityRow = {
  id: string;
  profile_id: string;
  name: string;
  device_name: string | null;
  kind: string;
  object_id: string | null;
  amount: number | null;
  detail: string;
  created_at: string;
};

/** Historique réservé aux profils qui ont le droit « audit » (propriétaire, manager). */
export async function staffActivity(
  db: DB,
  r: string,
  user: Actor,
  q: z.infer<typeof activityQuery>,
) {
  requirePermission(user.roles ?? user.role, "audit");
  if (!(await staffSchemaReady(db))) return { activity: [], members: [], totals: [] };
  const filters = ["a.restaurant_id=$1", "a.created_at > now() - make_interval(days => $2)"];
  const params: unknown[] = [r, q.days];
  if (q.member) {
    params.push(q.member);
    filters.push(`a.profile_id=$${params.length}`);
  }
  if (q.kind === "pin") filters.push("a.kind LIKE 'pin_%'");
  else if (q.kind) {
    params.push(q.kind);
    filters.push(`a.kind=$${params.length}`);
  }
  const where = filters.join(" AND ");
  return {
    activity: await rows<StaffActivityRow>(
      db,
      `SELECT a.id,a.profile_id,p.name,d.name AS device_name,a.kind,a.object_id,a.amount,a.detail,a.created_at
       FROM staff_activity a JOIN profiles p ON p.id=a.profile_id LEFT JOIN profiles d ON d.id=a.device_profile_id
       WHERE ${where} ORDER BY a.created_at DESC LIMIT 300`,
      params,
    ),
    // Synthèse par personne sur la période : nombre de commandes, encaissements et montant.
    totals: await rows<{ profile_id: string; name: string; orders: number; payments: number; amount: number; cancels: number }>(
      db,
      `SELECT a.profile_id,p.name,
         count(*) FILTER (WHERE a.kind='order')::int AS orders,
         count(*) FILTER (WHERE a.kind='payment')::int AS payments,
         coalesce(sum(a.amount) FILTER (WHERE a.kind='payment'),0)::int AS amount,
         count(*) FILTER (WHERE a.kind='cancel_item')::int AS cancels
       FROM staff_activity a JOIN profiles p ON p.id=a.profile_id
       WHERE ${where} GROUP BY a.profile_id,p.name ORDER BY p.name`,
      params,
    ),
    members: await rows<{ id: string; name: string }>(
      db,
      "SELECT DISTINCT p.id,p.name FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=$1 ORDER BY p.name",
      [r],
    ),
  };
}
