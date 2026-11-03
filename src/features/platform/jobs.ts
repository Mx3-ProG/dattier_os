import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/database/db";
export async function enqueue(
  db: DB,
  restaurant: string,
  kind: string,
  key: string,
  payload: unknown,
) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(restaurant_id,kind,dedupe_key) DO NOTHING",
    [id, restaurant, kind, JSON.stringify(payload), key],
  );
  return id;
}
