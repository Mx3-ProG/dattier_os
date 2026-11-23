import { randomUUID } from "node:crypto";
import type { DB } from "@/infrastructure/database/db";
import type { BusinessId } from "@/core/tenant/business";
/** Durable outbox job, scoped to one business (column `restaurant_id`, historic name). */
export async function enqueue(
  db: DB,
  business: BusinessId,
  kind: string,
  key: string,
  payload: unknown,
  availableAt?: Date,
) {
  const id = randomUUID();
  await db.query("SELECT app.enqueue_job($1,$2,$3,$4::jsonb,$5,$6::timestamptz)", [
    id,
    business,
    kind,
    JSON.stringify(payload),
    key,
    availableAt?.toISOString() ?? null,
  ]);
  return id;
}
