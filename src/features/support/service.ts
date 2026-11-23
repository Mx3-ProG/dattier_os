import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requirePermission } from "@/core/permissions";
import { authenticated } from "@/features/platform/http";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { rows, type DB } from "@/infrastructure/database/db";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), customerId: z.string().min(1).max(180), orderId: z.string().min(1).max(180).optional(), category: z.enum(["question", "return", "exchange", "warranty"]), subject: z.string().trim().min(1).max(180), description: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal("update"), id: z.string().uuid(), status: z.enum(["open", "in_progress", "resolved", "closed"]), resolution: z.string().trim().max(5000) }).refine((value) => !["resolved", "closed"].includes(value.status) || value.resolution.length > 0, { message: "Indiquez la résolution avant de clôturer le dossier." }),
  z.object({ action: z.literal("assign"), id: z.string().uuid(), profileId: z.string().min(1).max(180).nullable() }),
  z.object({ action: z.literal("note"), id: z.string().uuid(), text: z.string().trim().min(1).max(2000) }),
]);

async function access(db: DB, user: Actor, restaurant: string) {
  const member = await scope(db, user, restaurant);
  requirePermission(member.roles ?? member.role, "customers");
  await requirePaidAddon(db, restaurant, "pipeline-crm");
}

async function recordEvent(db: DB, restaurant: string, caseId: string, kind: "created" | "status" | "assignment" | "note", detail: string, actorId: string) {
  await db.query("INSERT INTO customer_support_events(id,restaurant_id,case_id,kind,detail,actor_id) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), restaurant, caseId, kind, detail.slice(0, 5000), actorId]);
}

export async function supportState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant);
    return {
      cases: await rows(db, `SELECT id,customer_id,order_id,category,subject,description,status,resolution,assigned_to,created_at,updated_at
        FROM customer_support_cases WHERE restaurant_id=$1 ORDER BY updated_at DESC LIMIT 500`, [restaurant]),
      events: await rows(db, `SELECT e.id,e.case_id,e.kind,e.detail,e.created_at,p.name AS actor_name
        FROM customer_support_events e JOIN profiles p ON p.id=e.actor_id
        WHERE e.restaurant_id=$1 ORDER BY e.created_at DESC LIMIT 2000`, [restaurant]),
      customers: await rows(db, "SELECT id,name FROM customers WHERE restaurant_id=$1 ORDER BY name LIMIT 1000", [restaurant]),
      orders: await rows(db, `SELECT s.order_id,s.customer_id,s.number,o.created_at FROM shop_orders s JOIN orders o ON o.id=s.order_id
        WHERE o.restaurant_id=$1 AND s.customer_id IS NOT NULL ORDER BY o.created_at DESC LIMIT 1000`, [restaurant]),
      assignees: await rows(db, "SELECT DISTINCT p.id,p.name FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=$1 ORDER BY p.name LIMIT 200", [restaurant]),
    };
  });
}

export async function supportPerform(restaurant: string, raw: unknown) {
  const action = actionSchema.parse(raw);
  await authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant);
    if (action.action === "create") {
      const caseId = randomUUID();
      await db.query(`INSERT INTO customer_support_cases(id,restaurant_id,customer_id,order_id,category,subject,description,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [caseId, restaurant, action.customerId, action.orderId ?? null, action.category, action.subject, action.description, user.id]);
      await recordEvent(db, restaurant, caseId, "created", "Dossier ouvert.", user.id);
    } else if (action.action === "update") {
      const previous = (await rows<{ status: string; resolution: string }>(db, "SELECT status,resolution FROM customer_support_cases WHERE restaurant_id=$1 AND id=$2 FOR UPDATE", [restaurant, action.id]))[0];
      const result = await db.query(`UPDATE customer_support_cases SET status=$3,resolution=$4,updated_at=now()
        WHERE restaurant_id=$1 AND id=$2 AND status<>'closed' RETURNING id`, [restaurant, action.id, action.status, action.resolution]);
      if (!result.rows.length) throw new Error("Dossier SAV introuvable ou déjà clos.");
      if (previous?.status !== action.status || previous?.resolution !== action.resolution)
        await recordEvent(db, restaurant, action.id, "status", `Statut : ${previous?.status ?? "?"} → ${action.status}.${action.resolution ? ` Résolution : ${action.resolution}` : ""}`, user.id);
    } else if (action.action === "assign") {
      const result = await db.query(`UPDATE customer_support_cases SET assigned_to=$3,updated_at=now()
        WHERE restaurant_id=$1 AND id=$2 AND status<>'closed'
          AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM memberships WHERE restaurant_id=$1 AND profile_id=$3)) RETURNING id`, [restaurant, action.id, action.profileId]);
      if (!result.rows.length) throw new Error("Dossier SAV ou membre introuvable dans cet établissement.");
      const assigned = action.profileId ? (await rows<{ name: string }>(db, "SELECT name FROM profiles WHERE id=$1", [action.profileId]))[0]?.name : null;
      await recordEvent(db, restaurant, action.id, "assignment", assigned ? `Attribué à ${assigned}.` : "Attribution retirée.", user.id);
    } else {
      const exists = (await rows(db, "SELECT id FROM customer_support_cases WHERE restaurant_id=$1 AND id=$2 AND status<>'closed'", [restaurant, action.id])).length;
      if (!exists) throw new Error("Dossier SAV introuvable ou clos.");
      await recordEvent(db, restaurant, action.id, "note", action.text, user.id);
    }
  });
  return supportState(restaurant);
}
