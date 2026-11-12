import { databaseContext } from "@/infrastructure/database/context";
import type { Database as PGlite } from "@/infrastructure/database/types";
import { getDb } from "@/infrastructure/database/db";
import { actor } from "@/infrastructure/auth/session";
import { classifyFailure, type FailureContext } from "./classify";
import { record } from "./events";
import { startScheduler } from "./engine";
import {
  diagnose,
  exportArchive,
  listArchives,
  listEvents,
  listIncidents,
  listRemediations,
  overview,
  securityAction,
  securityScope,
} from "./service";

/** Compatibility hook; maintenance runs through the persistent worker. */
export const bootSecurity = (db: PGlite) => startScheduler(db);

/**
 * Records a failure returned by a route handler. Runs after the business
 * transaction rolled back, on the base connection. Never throws.
 */
export async function recordFailure(
  error: unknown,
  ctx: FailureContext & { restaurant?: string | null },
) {
  try {
    const k = classifyFailure(error, ctx);
    const restaurant =
      ctx.restaurant ?? databaseContext.getStore()?.restaurantId;
    if (!restaurant) {
      console.error(
        JSON.stringify({
          level: "security-event",
          type: k.event_type,
          code: k.error_code,
        }),
      );
      return;
    }
    const db = await getDb().catch(() => null);
    const input = {
      ...k,
      action: `${ctx.endpoint ?? "?"}${ctx.action ? ` · ${ctx.action}` : ""}`,
      restaurant_id: restaurant,
      status: "failure" as const,
      details: { httpStatus: ctx.status, error },
    };
    if (db) await record(db, input);
    else
      console.error(
        JSON.stringify({
          level: "security-journal-unavailable",
          type: k.event_type,
          code: k.error_code,
        }),
      );
  } catch {
    // The journal must never change the response returned to the user.
  }
}

export async function securityGet(db: PGlite, params: URLSearchParams) {
  const restaurant = params.get("restaurant") || "";
  const s = await securityScope(db, await actor(), restaurant);
  const view = params.get("view") || "overview";
  const filter = params.get("scope") || undefined;
  if (view === "overview") return overview(db, s);
  if (view === "events") return listEvents(db, s, Object.fromEntries(params));
  if (view === "incidents") return listIncidents(db, s, filter);
  if (view === "remediations") return listRemediations(db, s, filter);
  if (view === "archives") return listArchives(db, s);
  if (view === "archive") return exportArchive(db, s, params.get("day") || "");
  if (view === "diagnose") return diagnose(db, s, params.get("event") || "");
  throw new Error("Vue inconnue.");
}
export async function securityPost(db: PGlite, body: Record<string, unknown>) {
  const restaurant = typeof body.restaurant === "string" ? body.restaurant : "";
  const s = await securityScope(db, await actor(), restaurant);
  return securityAction(db, s, body);
}
