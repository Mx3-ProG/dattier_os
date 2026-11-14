import { requirePlan, requireCommercialCapability, requirePaidAddon, restaurantPlan } from "@/features/platform/entitlements";
import { createReward, rewardSchema } from "@/features/loyalty/service";
import { offlinePerform } from "@/features/offline/service";
import { securityAction } from "./security";
import { z } from "zod";
import { resetPin, staffSchemaReady } from "@/features/team/pins";
import { saveVisibility, teamVisibility, visibilitySchema } from "@/features/team/visibility";
import { rows, one, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { commerce } from "@/features/commerce/service";
import { siteState, sitePerform } from "@/features/site/service";
import { platformPerform } from "./service";
import { log } from "@/features/orders/service";
import { inventoryPerform, inventoryState } from "./inventory";
import { seoPerform, seoState } from "@/features/seo/admin";
import { requireRestaurantIndustry } from "@/features/onboarding/access";
export async function adminState(
  db: DB,
  r: string,
  user: Actor,
  module: string,
  after = 0,
) {
  user = await scope(db, user, r);
  if (["shop","inventory"].includes(module)) await requireRestaurantIndustry(db,r);
  if (["site", "seo", "loyalty"].includes(module)) await requireCommercialCapability(db, r, module === "loyalty" ? "loyalty" : "website");
  if (module === "site") return siteState(db, r, user);
  if (module === "seo") return seoState(db, r, user);
  if (module === "shop") {
    requirePermission(user.roles ?? user.role, "orders");
    const plan = await restaurantPlan(db, r);
    const shopEnabled = plan >= 39;
    return {
      shopEnabled,
      settings: shopEnabled ? await commerce(r).settings(db) : null,
      orders: await commerce(r).staffOrders(db, user),
      reviews:
        plan >= 39
          ? await rows(
              db,
              "SELECT p.*,m.name AS product,c.name AS customer FROM product_reviews p JOIN menu_items m ON m.id=p.menu_id JOIN customers c ON c.id=p.customer_id WHERE p.restaurant_id=$1 ORDER BY created_at DESC LIMIT 100",
              [r],
            )
          : [],
    };
  }
  if (module === "team") {
    requirePermission(user.roles ?? user.role, "team");
    return {
      members: await rows(
        db,
        "SELECT p.id,p.name,p.email,m.role FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=$1 ORDER BY p.name,m.role",
        [r],
      ),
      // Décisions explicites sur le droit de modifier le plan de salle.
      floorLayout: await rows(
        db,
        "SELECT profile_id,allowed FROM floor_layout_access WHERE restaurant_id=$1",
        [r],
      ),
      invitations: await rows(
        db,
        "SELECT id,email,roles,expires_at,accepted_at FROM invitations WHERE restaurant_id=$1 ORDER BY expires_at DESC LIMIT 100",
        [r],
      ),
      // Codes PIN (sans les empreintes) et entrées masquées par membre.
      staff: await teamVisibility(db, r),
    };
  }
  if (module === "loyalty") {
    requirePermission(user.roles ?? user.role, "customers");
    return {
      rewards: await rows(
        db,
        "SELECT id,name,points_cost,active FROM loyalty_rewards WHERE restaurant_id=$1 ORDER BY created_at DESC",
        [r],
      ),
    };
  }
  if (module === "inventory") return inventoryState(db, r, user);
  if (module === "security") {
    requirePermission(user.roles ?? user.role, "audit");
    const conflictsEnabled=(await one<{enabled:boolean}>(db,
      "SELECT app.addon_installed($1,'offline-conflicts') AS enabled",[r])).enabled;
    return {
      events: await rows(
        db,
        "SELECT a.*,p.name FROM audit_logs a LEFT JOIN profiles p ON p.id=a.actor WHERE a.restaurant_id=$1 ORDER BY a.created_at DESC LIMIT 100 OFFSET $2",
        [r, after],
      ),
      conflicts: conflictsEnabled ? await rows(
        db,
        "SELECT o.id,o.error,o.payload,d.name AS device FROM offline_operations o JOIN offline_devices d ON d.id=o.device_id WHERE d.restaurant_id=$1 AND o.status='conflict' ORDER BY o.created_at DESC LIMIT 100",
        [r],
      ) : [],
      incidents: await rows(
        db,
        "SELECT id,rule,message,status,updated_at FROM security_incidents WHERE restaurant_id=$1 ORDER BY updated_at DESC LIMIT 100",
        [r],
      ),
      jobs: await rows(
        db,
        "SELECT id,kind,status,attempts,last_error FROM outbox_jobs WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 50",
        [r],
      ),
      support: await rows(
        db,
        "SELECT id,profile_id,reason,expires_at,revoked_at FROM support_grants WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 50",
        [r],
      ),
    };
  }
  if (module === "events") {
    const latest = await one<{ cursor: number }>(
      db,
      "SELECT coalesce(max(sequence),0)::int AS cursor FROM restaurant_events WHERE restaurant_id=$1",
      [r],
    );
    const events =
      after === 0
        ? []
        : await rows<{ sequence: number }>(
            db,
            "SELECT sequence,event_type,resource_id,created_at FROM restaurant_events WHERE restaurant_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100",
            [r, after],
          );
    return {
      events,
      cursor: events.length ? events.at(-1)!.sequence : latest.cursor,
    };
  }
  if (module === "integrations") {
    requirePermission(user.roles ?? user.role, "settings");
    await requirePaidAddon(db,r,"connections");
    return {
      connections: await rows(
        db,
        "SELECT id,kind,provider,status,validation_evidence FROM integration_connections WHERE restaurant_id=$1",
        [r],
      ),
      modules: [
        { kind: "cash_register", label: "Caisse", status: "unconfigured" },
        { kind: "payment", label: "Paiement en ligne", status: "unconfigured" },
        { kind: "accounting", label: "Comptabilité", status: "unconfigured" },
        { kind: "payroll", label: "Paie", status: "unconfigured" },
        { kind: "delivery", label: "Livraison", status: "unconfigured" },
      ],
    };
  }
  throw new Error("Module inconnu.");
}
export async function adminPerform(
  db: DB,
  r: string,
  user: Actor,
  module: string,
  raw: unknown,
) {
  user = await scope(db, user, r);
  if (["shop","inventory"].includes(module)) await requireRestaurantIndustry(db,r);
  if (["site", "seo", "loyalty"].includes(module)) await requireCommercialCapability(db, r, module === "loyalty" ? "loyalty" : "website");
  if (module === "site") return sitePerform(db, r, user, raw);
  if (module === "seo") return seoPerform(db, r, user, raw);
  if (module === "team") {
    const input = z
      .object({ action: z.enum(["invite", "membership", "floorLayout", "pinRequired", "resetPin", "visibility"]) })
      .parse(raw);
    if (["pinRequired", "resetPin", "visibility"].includes(input.action)) {
      const admin = await one<{ allowed: boolean }>(db, "SELECT coalesce(app.restaurant_admin($1),false) AS allowed", [r]);
      if (!admin.allowed) throw new Error("Seul un administrateur de l’établissement peut modifier ce réglage.");
      if (input.action === "visibility") return saveVisibility(db, r, user, visibilitySchema.parse(raw));
      if (input.action === "resetPin") {
        const a = z.object({ profile: z.string().min(1).max(100) }).parse(raw);
        await resetPin(db, r, user, a.profile);
        return { updated: true };
      }
      const a = z.object({ required: z.boolean() }).parse(raw);
      if (!(await staffSchemaReady(db))) throw new Error("Réglage indisponible : mise à jour de la base en attente.");
      await db.query("UPDATE restaurants SET staff_pin_required=$2 WHERE id=$1", [r, a.required]);
      await log(db, r, user.id, a.required ? "Validation par code PIN activée" : "Validation par code PIN désactivée", r);
      return { updated: true };
    }
    return platformPerform(db, user, {
      ...(raw as object),
      action: input.action,
      restaurant: r,
    });
  }
  if (module === "loyalty") {
    requirePermission(user.roles ?? user.role, "customers");
    const action = raw as { action?: string };
    if (action.action === "loyaltyReward")
      return createReward(db, r, user, rewardSchema.parse(raw));
    const a = z
      .object({
        action: z.literal("rewardLifecycle"),
        id: z.string(),
        active: z.boolean(),
      })
      .parse(raw);
    await db.query(
      "UPDATE loyalty_rewards SET active=$3 WHERE id=$1 AND restaurant_id=$2",
      [a.id, r, a.active],
    );
    await log(
      db,
      r,
      user.id,
      a.active ? "Récompense restaurée" : "Récompense archivée",
      a.id,
    );
    return { updated: true };
  }
  if (module === "inventory") return inventoryPerform(db, r, user, raw);
  if (module === "security") {
    const a = raw as { action?: string };
    if (a.action === "resolveConflict") return offlinePerform(db, r, user, raw);
    if (a.action === "revokeSupport" || a.action === "support")
      return platformPerform(db, user, { ...a, restaurant: r });
    return securityAction(db, r, user, raw);
  }
  if (module === "shop") {
    const input = z
        .object({
          action: z.enum([
            "settings",
            "product",
            "settle",
            "transition",
            "moderate",
          ]),
          data: z.unknown(),
        })
        .parse(raw),
      shop = commerce(r);
    if (input.action === "settings" || input.action === "product")
      await requireCommercialCapability(db, r, "online-orders");
    if (input.action === "moderate") await requirePlan(db, r, 39);
    if (input.action === "settings")
      return shop.updateSettings(db, user, input.data);
    if (input.action === "product")
      return shop.updateDetails(db, user, input.data);
    if (input.action === "moderate") {
      requirePermission(user.roles ?? user.role, "customers");
      const a = z
        .object({
          id: z.string(),
          status: z.enum(["published", "rejected", "archived"]),
          reply: z.string().max(1000),
        })
        .parse(input.data);
      await one(
        db,
        "SELECT id FROM product_reviews WHERE id=$1 AND restaurant_id=$2",
        [a.id, r],
      );
      await db.query(
        "UPDATE product_reviews SET status=$2,admin_reply=$3,moderated_by=$4,moderated_at=now(),updated_at=now() WHERE id=$1",
        [a.id, a.status, a.reply, user.id],
      );
      await log(db, r, user.id, "Avis modéré", a.id);
      return { updated: true };
    }
    const a = z.object({ id: z.string(), value: z.string() }).parse(input.data);
    if (input.action === "settle") {
      await shop.settle(
        db,
        a.id,
        z.enum(["cash", "card"]).parse(a.value),
        user,
      );
    } else {
      await shop.transition(
        db,
        a.id,
        z.enum(["preparing", "ready", "served", "cancelled"]).parse(a.value),
        user,
      );
    }
    return { updated: true };
  }
  throw new Error("Module en lecture seule.");
}
