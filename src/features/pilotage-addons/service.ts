import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticated } from "@/features/platform/http";
import { scope, type Actor } from "@/lib/auth/session";
import { rows, type DB } from "@/lib/database/db";
import { requirePermission } from "@/lib/permissions";
import { requirePaidAddon } from "@/features/platform/entitlements";

const short = z.string().trim().min(1).max(180);
const optional = z.string().trim().max(300).optional();
export const crmActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("company"), name: short, siret: z.string().regex(/^\d{14}$/).optional(), activity: optional, city: optional, email: z.email().optional(), phone: optional }),
  z.object({ action: z.literal("contact"), companyId: z.string().uuid(), name: short, role: optional, email: z.email().optional(), phone: optional, notes: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("opportunity"), companyId: z.string().uuid(), title: short, amountCents: z.number().int().min(0).max(1_000_000_000), expectedOn: z.iso.date().optional() }),
  z.object({ action: z.literal("stage"), id: z.string().uuid(), stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]) }),
  z.object({ action: z.literal("activity"), opportunityId: z.string().uuid(), kind: z.enum(["task", "call", "email", "note", "meeting"]), title: z.string().trim().min(1).max(300), dueAt: z.iso.datetime().optional() }),
  z.object({ action: z.literal("complete-activity"), id: z.string().uuid() }),
]);

async function access(db: DB, user: Actor, restaurant: string, addon: "pipeline-crm" | "customer-health") {
  const member = await scope(db, user, restaurant);
  requirePermission(member.roles ?? member.role, addon === "customer-health" ? "customers" : "analytics");
  await requirePaidAddon(db, restaurant, addon);
}

export async function crmState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant, "pipeline-crm");
    return {
      companies: await rows(db, "SELECT id,name,siret,activity,address,city,phone,email,website,source,score,score_signals,provenance,status,updated_at FROM crm_companies WHERE restaurant_id=$1 AND status<>'archived' ORDER BY updated_at DESC LIMIT 500", [restaurant]),
      contacts: await rows(db, "SELECT id,company_id,name,role,email,phone,notes,updated_at FROM crm_contacts WHERE restaurant_id=$1 ORDER BY updated_at DESC LIMIT 1000", [restaurant]),
      opportunities: await rows(db, "SELECT id,company_id,title,stage,amount_cents,expected_on,created_at,updated_at FROM crm_opportunities WHERE restaurant_id=$1 ORDER BY updated_at DESC LIMIT 500", [restaurant]),
      activities: await rows(db, "SELECT id,opportunity_id,kind,title,due_at,done_at,created_at FROM crm_activities WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 1000", [restaurant]),
    };
  });
}

export async function crmPerform(restaurant: string, raw: unknown) {
  const action = crmActionSchema.parse(raw);
  await authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant, "pipeline-crm");
    if (action.action === "company") {
      await db.query("INSERT INTO crm_companies(id,restaurant_id,name,siret,activity,city,email,phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [randomUUID(), restaurant, action.name, action.siret ?? null, action.activity ?? null, action.city ?? null, action.email ?? null, action.phone ?? null]);
    } else if (action.action === "contact") {
      await db.query("INSERT INTO crm_contacts(id,restaurant_id,company_id,name,role,email,phone,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [randomUUID(), restaurant, action.companyId, action.name, action.role ?? null, action.email ?? null, action.phone ?? null, action.notes ?? null]);
    } else if (action.action === "opportunity") {
      await db.query("INSERT INTO crm_opportunities(id,restaurant_id,company_id,title,amount_cents,expected_on) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), restaurant, action.companyId, action.title, action.amountCents, action.expectedOn ?? null]);
    } else if (action.action === "stage") {
      const result = await db.query("UPDATE crm_opportunities SET stage=$3,updated_at=now() WHERE restaurant_id=$1 AND id=$2 RETURNING id", [restaurant, action.id, action.stage]);
      if (!result.rows.length) throw new Error("Opportunité introuvable dans cet établissement.");
    } else if (action.action === "activity") {
      await db.query("INSERT INTO crm_activities(id,restaurant_id,opportunity_id,kind,title,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), restaurant, action.opportunityId, action.kind, action.title, action.dueAt ?? null, user.id]);
    } else {
      const result = await db.query("UPDATE crm_activities SET done_at=now() WHERE restaurant_id=$1 AND id=$2 AND done_at IS NULL RETURNING id", [restaurant, action.id]);
      if (!result.rows.length) throw new Error("Activité introuvable ou déjà terminée.");
    }
  });
  return crmState(restaurant);
}

type HealthRow = { id: string; name: string; contact: string; consent: boolean; points: number; orders: number; orders_90d: number; ltv_cents: number; last_order_at: string | null; first_order_at: string | null };
export function customerHealthScore(row: Pick<HealthRow, "orders_90d" | "points" | "last_order_at">, now = Date.now()) {
  const age = row.last_order_at ? (now - Date.parse(row.last_order_at)) / 86_400_000 : Infinity;
  const recency = age <= 30 ? 50 : age <= 90 ? 35 : age <= 180 ? 15 : 0;
  const frequency = Math.min(35, row.orders_90d * 12);
  const loyalty = Math.min(15, Math.floor(row.points / 20));
  return { total: recency + frequency + loyalty, recency, frequency, loyalty };
}

export async function customerHealthState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant, "customer-health");
    const customers = await rows<HealthRow>(db, `
      SELECT c.id,c.name,c.contact,c.consent,c.points,
        count(o.id)::int AS orders,
        count(o.id) FILTER (WHERE o.created_at>=now()-interval '90 days')::int AS orders_90d,
        coalesce(sum(s.total),0)::int AS ltv_cents,
        max(o.created_at)::text AS last_order_at,
        min(o.created_at)::text AS first_order_at
      FROM customers c
      LEFT JOIN shop_orders s ON s.customer_id=c.id AND s.payment_status='paid'
      LEFT JOIN orders o ON o.id=s.order_id AND o.restaurant_id=c.restaurant_id
      WHERE c.restaurant_id=$1
      GROUP BY c.id,c.name,c.contact,c.consent,c.points
      ORDER BY max(o.created_at) DESC NULLS LAST,c.name LIMIT 500`, [restaurant]);
    const trend = await rows<{ month: string; revenue_cents: number; orders: number }>(db, `
      SELECT to_char(date_trunc('month',o.created_at),'YYYY-MM') AS month,
        sum(s.total)::int AS revenue_cents,count(*)::int AS orders
      FROM shop_orders s JOIN orders o ON o.id=s.order_id
      WHERE o.restaurant_id=$1 AND s.payment_status='paid' AND s.customer_id IS NOT NULL
        AND o.created_at>=date_trunc('month',now())-interval '5 months'
      GROUP BY 1 ORDER BY 1`, [restaurant]);
    return {
      customers: customers.map((row) => ({ ...row, health: customerHealthScore(row) })),
      trend,
      definition: "LTV = somme des commandes en ligne payées liées au client ; score = récence (50), commandes des 90 derniers jours (35), points de fidélité (15).",
    };
  });
}
