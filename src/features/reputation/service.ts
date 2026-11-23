import { z } from "zod";
import { requirePermission } from "@/core/permissions";
import { authenticated } from "@/features/platform/http";
import { adminPerform } from "@/features/platform/admin";
import { requirePlan } from "@/features/platform/entitlements";
import { scope } from "@/infrastructure/auth/session";
import { rows } from "@/infrastructure/database/db";

const moderateSchema = z.object({ id: z.string().min(1).max(180), status: z.enum(["published", "rejected", "archived"]), reply: z.string().trim().max(1000) });

export async function reputationState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    const member = await scope(db, user, restaurant);
    requirePermission(member.roles ?? member.role, "customers");
    await requirePlan(db, restaurant, 39);
    const metrics = (await rows<{ total: number; pending: number; awaiting_reply: number; verified: number; average_rating: number | null }>(db, `
      SELECT count(*) FILTER (WHERE status='published')::int AS total,
        count(*) FILTER (WHERE status='pending')::int AS pending,
        count(*) FILTER (WHERE status='published' AND btrim(admin_reply)='')::int AS awaiting_reply,
        count(*) FILTER (WHERE status='published' AND verified_purchase)::int AS verified,
        round(avg(rating) FILTER (WHERE status='published'),1)::float AS average_rating
      FROM product_reviews WHERE restaurant_id=$1`, [restaurant]))[0];
    return {
      metrics,
      reviews: await rows(db, `SELECT p.id,p.menu_id,m.name AS product,c.name AS customer,p.rating,p.body,p.status,
        p.admin_reply,p.verified_purchase,p.created_at,p.moderated_at
        FROM product_reviews p JOIN menu_items m ON m.id=p.menu_id AND m.restaurant_id=p.restaurant_id
        JOIN customers c ON c.id=p.customer_id AND c.restaurant_id=p.restaurant_id
        WHERE p.restaurant_id=$1 ORDER BY
          CASE WHEN p.status='pending' THEN 0 WHEN p.status='published' AND btrim(p.admin_reply)='' THEN 1 ELSE 2 END,
          p.created_at DESC LIMIT 200`, [restaurant]),
    };
  });
}

export async function reputationModerate(restaurant: string, raw: unknown) {
  const input = moderateSchema.parse(raw);
  await authenticated(restaurant, async (db, user) => {
    await adminPerform(db, restaurant, user, "shop", { action: "moderate", data: input });
  });
  return reputationState(restaurant);
}
