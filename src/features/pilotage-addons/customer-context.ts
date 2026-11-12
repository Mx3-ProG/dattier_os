import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requirePermission } from "@/core/permissions";
import { authenticated } from "@/features/platform/http";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { scope } from "@/infrastructure/auth/session";
import { rows } from "@/infrastructure/database/db";

const customerId = z.string().min(1).max(180);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("note"), customerId, body: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("tag"), customerId, tag: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal("remove-tag"), customerId, tag: z.string().min(1).max(40) }),
]);

export async function customerContextState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    const member = await scope(db, user, restaurant);
    requirePermission(member.roles ?? member.role, "customers");
    await requirePaidAddon(db, restaurant, "pipeline-crm");
    return {
      customers: await rows<{ id: string; name: string }>(db, "SELECT id,name FROM customers WHERE restaurant_id=$1 ORDER BY name LIMIT 1000", [restaurant]),
      notes: await rows(db, `SELECT n.id,n.customer_id,n.body,n.created_at,p.name AS author
        FROM crm_customer_notes n JOIN profiles p ON p.id=n.author_id
        WHERE n.restaurant_id=$1 ORDER BY n.created_at DESC LIMIT 1000`, [restaurant]),
      tags: await rows(db, "SELECT customer_id,tag FROM crm_customer_tags WHERE restaurant_id=$1 ORDER BY tag LIMIT 2000", [restaurant]),
    };
  });
}

export async function customerContextPerform(restaurant: string, raw: unknown) {
  const action = actionSchema.parse(raw);
  await authenticated(restaurant, async (db, user) => {
    const member = await scope(db, user, restaurant);
    requirePermission(member.roles ?? member.role, "customers");
    await requirePaidAddon(db, restaurant, "pipeline-crm");
    const customer = await rows(db, "SELECT id FROM customers WHERE restaurant_id=$1 AND id=$2", [restaurant, action.customerId]);
    if (!customer.length) throw new Error("Client introuvable dans cet établissement.");
    if (action.action === "note") await db.query("INSERT INTO crm_customer_notes(id,restaurant_id,customer_id,body,author_id) VALUES($1,$2,$3,$4,$5)", [randomUUID(), restaurant, action.customerId, action.body, user.id]);
    else if (action.action === "tag") await db.query("INSERT INTO crm_customer_tags(restaurant_id,customer_id,tag) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [restaurant, action.customerId, action.tag]);
    else await db.query("DELETE FROM crm_customer_tags WHERE restaurant_id=$1 AND customer_id=$2 AND tag=$3", [restaurant, action.customerId, action.tag]);
  });
  return customerContextState(restaurant);
}
