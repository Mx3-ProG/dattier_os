import { z } from "zod";
import { requirePermission } from "@/core/permissions";
import { authenticated } from "@/features/platform/http";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { rows, type DB } from "@/infrastructure/database/db";

const recordSchema = z.object({ orderId: z.string().min(1).max(180), status: z.enum(["reviewed", "contacted"]), channel: z.enum(["email", "phone", "other"]).nullable(), note: z.string().trim().max(1000) })
  .refine((value) => value.status !== "contacted" || value.channel !== null, { message: "Indiquez le canal de contact." });

async function access(db: DB, restaurant: string, user: Actor) {
  const member = await scope(db, user, restaurant);
  requirePermission(member.roles ?? member.role, "orders");
  requirePermission(member.roles ?? member.role, "customers");
  await requirePaidAddon(db, restaurant, "pipeline-crm");
}

export async function paymentRecoveryData(db: DB, restaurant: string) {
  const condition = `o.restaurant_id=$1 AND s.payment_method='stripe' AND s.stripe_session IS NOT NULL
    AND s.payment_status='unpaid' AND o.status<>'cancelled'
    AND o.created_at<now()-interval '30 minutes' AND o.created_at>now()-interval '30 days'`;
  const summary = (await rows<{ count: number; amount_cents: number }>(db, `SELECT count(*)::int AS count,coalesce(sum(s.total),0)::int AS amount_cents
    FROM shop_orders s JOIN orders o ON o.id=s.order_id WHERE ${condition}`, [restaurant]))[0];
  const orders = await rows(db, `SELECT s.order_id,s.number,s.total,o.created_at,o.customer_name,o.contact,
    c.id AS customer_id,c.consent AS contact_consent,coalesce(oc.marketing_consent,false) AS account_consent,
    f.status AS followup_status,f.channel AS followup_channel,f.note AS followup_note,f.updated_at AS followup_at
    FROM shop_orders s JOIN orders o ON o.id=s.order_id
    LEFT JOIN customers c ON c.id=s.customer_id AND c.restaurant_id=o.restaurant_id
    LEFT JOIN organization_customers oc ON oc.id=c.account_id
    LEFT JOIN crm_checkout_followups f ON f.restaurant_id=o.restaurant_id AND f.order_id=o.id
    WHERE ${condition} ORDER BY o.created_at DESC LIMIT 200`, [restaurant]);
  return { summary, orders };
}

export async function paymentRecoveryState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await access(db, restaurant, user);
    return paymentRecoveryData(db, restaurant);
  });
}
export async function recordPaymentFollowup(db: DB, restaurant: string, action: z.infer<typeof recordSchema>, actorId: string) {
    const eligible = await rows(db, `SELECT s.order_id FROM shop_orders s JOIN orders o ON o.id=s.order_id
      WHERE o.restaurant_id=$1 AND o.id=$2 AND s.payment_method='stripe' AND s.stripe_session IS NOT NULL
        AND s.payment_status='unpaid' AND o.status<>'cancelled' AND o.created_at<now()-interval '30 minutes'
        AND o.created_at>now()-interval '30 days' FOR UPDATE OF s,o`, [restaurant, action.orderId]);
    if (!eligible.length) throw new Error("Paiement déjà confirmé, commande annulée ou dossier indisponible.");
    await db.query(`INSERT INTO crm_checkout_followups(restaurant_id,order_id,status,channel,note,actor_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (restaurant_id,order_id) DO UPDATE SET
      status=excluded.status,channel=excluded.channel,note=excluded.note,actor_id=excluded.actor_id,updated_at=now()
      WHERE crm_checkout_followups.status<>'contacted' OR excluded.status='contacted'`,
      [restaurant, action.orderId, action.status, action.channel, action.note, actorId]);
}

export async function paymentRecoveryRecord(restaurant: string, raw: unknown) {
  const action = recordSchema.parse(raw);
  await authenticated(restaurant, async (db, user) => {
    await access(db, restaurant, user);
    await recordPaymentFollowup(db, restaurant, action, user.id);
  });
  return paymentRecoveryState(restaurant);
}
