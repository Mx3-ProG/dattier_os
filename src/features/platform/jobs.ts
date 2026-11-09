import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/database/db";
export async function enqueue(
  db: DB,
  restaurant: string,
  kind: string,
  key: string,
  payload: unknown,
  availableAt?: Date,
) {
  const id = randomUUID();
  await db.query("SELECT app.enqueue_job($1,$2,$3,$4::jsonb,$5,$6::timestamptz)", [
    id,
    restaurant,
    kind,
    JSON.stringify(payload),
    key,
    availableAt?.toISOString() ?? null,
  ]);
  return id;
}
