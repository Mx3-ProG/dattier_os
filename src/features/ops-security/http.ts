import { databaseContext } from "@/lib/database/context";
import type { Database as PGlite } from "@/lib/database/types";
import { getDb } from "@/lib/database/db";
import { actor } from "@/lib/auth/session";
import { classifyFailure, type FailureContext } from "./classify";
import { requestContext } from "./context";
import { record } from "./events";
import { scrubText } from "./sanitize";
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
 * A signed-in account without access to the establishment cannot write in its
 * journal: the database records the attempt itself, with fixed and bounded
 * content. Returns false when the regular journal applies.
 * See docs/platform/TENANT_ISOLATION.md.
 */
async function recordDeniedAccess(db: PGlite, restaurant: string) {
  const request = requestContext();
  try {
    const { rows } = await db.query<{ outcome: string }>(
      "SELECT app.record_denied_access($1,$2,$3,$4) AS outcome",
      [
        restaurant,
        request?.route ?? "",
        request?.clientRef ?? "",
        request?.correlationId ?? "",
      ],
    );
    return rows[0]?.outcome !== "not_applicable";
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "security-journal-unavailable",
        type: "access.denied.external",
        error: scrubText(error instanceof Error ? error.message : "", 200),
      }),
    );
    return true;
  }
}

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
    if (db && (await recordDeniedAccess(db, restaurant))) return;
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
