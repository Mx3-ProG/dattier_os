import { z } from "zod";
import type { DB } from "@/lib/database/types";
import { scope, type Actor } from "@/lib/auth/session";
import { moduleRegistry } from "@/core/modules/catalog";
import {
  legacyBusinessModules,
  resolveModuleRuntime,
  type ModuleRuntimeState,
} from "@/core/modules/runtime";
import { isDisplayableModule, type ModuleDisplay } from "./display";

const moduleIds = new Set(moduleRegistry.list().map((module) => module.id));
type Count = { count: number };
/** Counts only; no customer or order details leave this administrative endpoint. */
export async function moduleSuspensionPreflight(db: DB, restaurant: string) {
  const sessions = await db.query<Count>(
    "SELECT count(*)::int AS count FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id WHERE t.restaurant_id=$1 AND s.closed_at IS NULL",
    [restaurant],
  );
  const orders = await db.query<Count>(
    "SELECT count(*)::int AS count FROM orders o JOIN table_sessions s ON s.id=o.session_id JOIN dining_tables t ON t.id=s.table_id WHERE o.restaurant_id=$1 AND t.restaurant_id=$1 AND o.status IN ('pending','active')",
    [restaurant],
  );
  const reservations = await db.query<Count>(
    "SELECT count(*)::int AS count FROM reservations WHERE restaurant_id=$1 AND status IN ('requested','confirmed','arrived') AND ends_at>now()",
    [restaurant],
  );
  return {
    openTableSessions: sessions.rows[0].count,
    openTableOrders: orders.rows[0].count,
    upcomingReservations: reservations.rows[0].count,
  };
}
export const moduleRequestSchema = z
  .object({
    moduleId: z.string().refine((id) => moduleIds.has(id)),
    requestedState: z.enum(["enabled", "suspended"]),
    revision: z.number().int().min(0).max(2147483646),
  })
  .strict();
export const moduleApplySchema = z
  .object({
    moduleId: z.string().refine((id) => moduleIds.has(id)),
    revision: z.number().int().min(1).max(2147483646),
  })
  .strict();

async function requireModuleAdmin(db: DB, user: Actor, restaurant: string) {
  await scope(db, user, restaurant);
  const { rows } = await db.query<{ allowed: boolean }>(
    "SELECT app.org_admin((SELECT organization_id FROM restaurants WHERE id=$1)) AS allowed",
    [restaurant],
  );
  if (!rows[0]?.allowed)
    throw new Error(
      "Configuration des modules réservée à l’administrateur de l’organisation.",
    );
}

export async function readModuleSettings(
  db: DB,
  user: Actor,
  restaurant: string,
) {
  await requireModuleAdmin(db, user, restaurant);
  const { rows } = await db.query<{
    module_id: string;
    requested_state: "enabled" | "suspended";
    applied_state: "enabled" | "suspended";
    revision: number;
    updated_at: string;
  }>(
    "SELECT module_id,requested_state,applied_state,revision,updated_at FROM module_settings WHERE restaurant_id=$1 ORDER BY module_id",
    [restaurant],
  );
  const events = await db.query<{
    module_id: string;
    previous_state: string | null;
    requested_state: string;
    revision: number;
    actor_id: string;
    created_at: string;
  }>(
    "SELECT module_id,previous_state,requested_state,revision,actor_id,created_at FROM module_setting_events WHERE restaurant_id=$1 ORDER BY id DESC LIMIT 50",
    [restaurant],
  );
  const planResult = await db.query<{ plan: number | null }>(
    "SELECT app.restaurant_plan($1) AS plan",
    [restaurant],
  );
  const states = Object.fromEntries(
    rows.map((row) => [row.module_id, row.requested_state]),
  ) as Record<string, ModuleRuntimeState>;
  const preview = resolveModuleRuntime(
    legacyBusinessModules(planResult.rows[0]?.plan ?? 0),
    states,
  );
  const appliedStates = Object.fromEntries(
    rows.map((row) => [row.module_id, row.applied_state]),
  ) as Record<string, ModuleRuntimeState>;
  const effective = resolveModuleRuntime(
    legacyBusinessModules(planResult.rows[0]?.plan ?? 0),
    appliedStates,
  );
  const blockers = await moduleSuspensionPreflight(db, restaurant);
  const floorDependents = moduleRegistry.dependents(
    "floor",
    preview
      .filter((decision) => decision.available)
      .map((decision) => decision.id),
  );
  return {
    restaurant,
    requests: rows,
    events: events.rows,
    preview,
    effective,
    suspensionPreflight: {
      floor: { ...blockers, dependentModules: floorDependents },
      tableBooking: { upcomingReservations: blockers.upcomingReservations },
    },
    applied: false as const,
  };
}

export async function applyModuleSetting(
  db: DB,
  user: Actor,
  restaurant: string,
  raw: unknown,
) {
  const value = moduleApplySchema.parse(raw);
  await requireModuleAdmin(db, user, restaurant);
  const { rows } = await db.query<{ state: "enabled" | "suspended" }>(
    "SELECT app.apply_module_state($1,$2,$3) AS state",
    [restaurant, value.moduleId, value.revision],
  );
  return {
    restaurant,
    moduleId: value.moduleId,
    state: rows[0].state,
    applied: true as const,
  };
}

export async function requestModuleSetting(
  db: DB,
  user: Actor,
  restaurant: string,
  raw: unknown,
) {
  const value = moduleRequestSchema.parse(raw);
  await requireModuleAdmin(db, user, restaurant);
  const { rows } = await db.query<{ revision: number }>(
    "SELECT app.request_module_state($1,$2,$3,$4) AS revision",
    [restaurant, value.moduleId, value.requestedState, value.revision],
  );
  return {
    restaurant,
    moduleId: value.moduleId,
    requestedState: value.requestedState,
    revision: rows[0].revision,
    applied: false as const,
  };
}

export const moduleDisplaySchema = z
  .object({
    module: z.string().refine(isDisplayableModule, "Module inconnu."),
    // null : retour au comportement par défaut.
    shown: z.boolean().nullable(),
  })
  .strict();

/** Afficher, masquer ou rétablir un module dans le tableau de bord (super admin seulement, vérifié en SQL). */
export async function setModuleDisplay(
  db: DB,
  user: Actor,
  restaurant: string,
  raw: unknown,
) {
  const value = moduleDisplaySchema.parse(raw);
  await scope(db, user, restaurant);
  await db.query("SELECT app.module_display_set($1,$2,$3)", [restaurant, value.module, value.shown]);
  return { display: await readModuleDisplay(db, restaurant) };
}

export async function readModuleDisplay(db: DB, restaurant: string): Promise<ModuleDisplay[]> {
  const { rows } = await db.query<ModuleDisplay>(
    "SELECT module_id,shown FROM module_display WHERE restaurant_id=$1 ORDER BY module_id",
    [restaurant],
  );
  return rows;
}
