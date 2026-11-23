import { databaseContext } from "@/infrastructure/database/context";
import { randomUUID } from "node:crypto";
import type { Database as PGlite } from "@/infrastructure/database/types";
import type { DB } from "@/infrastructure/database/db";
import { requestContext } from "./context";
import { classifyAudit } from "./classify";
import { sanitize, scrubText } from "./sanitize";
import type { ModuleId, ResolutionStatus } from "./model";

export type EventInput = {
  severity: number;
  event_type: string;
  module: ModuleId | string;
  action: string;
  message: string;
  actor_id?: string | null;
  restaurant_id?: string | null;
  resource_id?: string | null;
  status?: "success" | "failure" | "info";
  error_code?: string | null;
  details?: Record<string, unknown>;
  resolution_status?: ResolutionStatus | null;
  incident_id?: string | null;
  correlation_id?: string | null;
  session_id?: string | null;
};
type Row = {
  event_id: string;
  occurred_at: string;
  values: unknown[];
};
const INSERT = `INSERT INTO ops_security_events(event_id,occurred_at,severity,event_type,module,action,actor_id,restaurant_id,session_id,correlation_id,resource_id,status,error_code,message,technical_details,resolution_status,incident_id)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT(event_id) DO NOTHING`;

// Le canal public ne relit pas ce journal : ON CONFLICT y serait refusé par la RLS.
// event_id est tiré au hasard à chaque événement, le doublon n'existe que pour un flush rejoué.
const insertSql = () =>
  databaseContext.getStore()?.public
    ? INSERT.replace(" ON CONFLICT(event_id) DO NOTHING", "")
    : INSERT;

/** Events that could not be written. Bounded; flushed by the maintenance tick. */
const tenantBuffers = new Map<string, { rows: Row[]; dropped: number }>();
const buffer = (create = false) => {
  const key = databaseContext.getStore()?.restaurantId || "unscoped";
  if (!tenantBuffers.has(key)) {
    if (!create) return { rows: [] as Row[], dropped: 0 };
    if (tenantBuffers.size >= 100)
      tenantBuffers.delete(tenantBuffers.keys().next().value!);
    tenantBuffers.set(key, { rows: [], dropped: 0 });
  }
  return tenantBuffers.get(key)!;
};
const BUFFER_LIMIT = 1000;
export const bufferState = () => ({
  pending: buffer().rows.length,
  dropped: buffer().dropped,
});

function build(input: EventInput): Row {
  const ctx = requestContext();
  const event_id = randomUUID();
  const occurred_at = new Date().toISOString();
  return {
    event_id,
    occurred_at,
    values: [
      event_id,
      occurred_at,
      Math.min(Math.max(Math.round(input.severity), 1), 6),
      input.event_type.slice(0, 120),
      input.module,
      scrubText(input.action, 300),
      input.actor_id ?? ctx?.actorId ?? null,
      input.restaurant_id ?? databaseContext.getStore()?.restaurantId ?? null,
      input.session_id ?? ctx?.sessionRef ?? null,
      input.correlation_id ?? ctx?.correlationId ?? null,
      input.resource_id ?? null,
      input.status ?? "info",
      input.error_code ?? null,
      scrubText(input.message, 600),
      JSON.stringify(
        sanitize({
          ...(input.details ?? {}),
          ...(ctx ? { route: ctx.route, client: ctx.clientRef } : {}),
        }),
      ),
      input.resolution_status ?? null,
      input.incident_id ?? null,
    ],
  };
}
const inTransaction = (db: DB) => "rollback" in db || "isTransaction" in db;
function keep(row: Row, error: unknown) {
  const b = buffer(true);
  if (b.rows.length >= BUFFER_LIMIT) {
    b.rows.shift();
    b.dropped++;
  }
  b.rows.push(row);
  // Last resort trail on stdout, already sanitized.
  console.error(
    JSON.stringify({
      level: "security-journal-unavailable",
      event_id: row.event_id,
      type: row.values[3],
      error: scrubText(
        error instanceof Error ? error.message : String(error),
        200,
      ),
    }),
  );
}

/**
 * Strict write for operations whose traceability is mandatory (settings,
 * approvals, resets): a journal failure aborts the surrounding transaction.
 */
export async function emit(db: DB, input: EventInput) {
  const row = build(input);
  await db.query(insertSql(), row.values);
  return row.event_id;
}

/**
 * Resilient write: a journal failure never breaks the business operation.
 * Inside a transaction a savepoint isolates the insert; the event is buffered.
 */
export async function record(db: DB, input: EventInput) {
  const row = build(input);
  try {
    if (inTransaction(db)) {
      await db.exec("SAVEPOINT security_event");
      try {
        await db.query(insertSql(), row.values);
        await db.exec("RELEASE SAVEPOINT security_event");
      } catch (error) {
        await db.exec("ROLLBACK TO SAVEPOINT security_event");
        throw error;
      }
    } else await db.query(insertSql(), row.values);
  } catch (error) {
    keep(row, error);
  }
  return row.event_id;
}

/** Re-inserts buffered events with their original timestamp. Idempotent by event_id. */
export async function flushBuffer(db: DB) {
  const b = buffer();
  if (!b.rows.length) return 0;
  const batch = b.rows.slice(0, 200);
  const write = async (tx: DB) => {
    await tx.query("SELECT set_config('donuts.security_import','on',true)");
    for (const row of batch) {
      // Never back-date into an already sealed day: the trigger stamps it now.
      const { rows: sealed } = await tx.query(
        "SELECT 1 FROM ops_security_archives WHERE day=($1::timestamptz AT TIME ZONE 'Europe/Paris')::date",
        [row.occurred_at],
      );
      const values = [...row.values];
      if (sealed.length) values[1] = null;
      await tx.query(INSERT, values);
    }
  };
  if (inTransaction(db)) await write(db);
  else await (db as PGlite).transaction(write);
  b.rows.splice(0, batch.length);
  return batch.length;
}

/** Mirror of the existing business audit trail (audit_logs) into the journal. */
export async function mirrorAudit(
  db: DB,
  restaurant: string,
  actor: string | null,
  action: string,
  object: string | null,
) {
  const k = classifyAudit(action);
  await record(db, {
    ...k,
    action,
    actor_id: actor,
    restaurant_id: restaurant,
    resource_id: object,
    status: "success",
  });
}
