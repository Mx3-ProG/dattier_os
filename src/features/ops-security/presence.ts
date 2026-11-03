import { createHash } from "node:crypto";
import type { DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { record } from "./events";
export async function registerPresence(db: DB, r: string, user: Actor) {
  const ref = createHash("sha256")
    .update(`${user.id}:${user.authIssuedAt || 0}`)
    .digest("hex")
    .slice(0, 24);
  const result = await db.query<{ inserted: boolean }>(
    "INSERT INTO ops_auth_presence(restaurant_id,profile_id,session_ref) VALUES($1,$2,$3) ON CONFLICT(restaurant_id,profile_id,session_ref) DO UPDATE SET last_seen=now() WHERE ops_auth_presence.last_seen<now()-interval '1 minute' RETURNING (xmax=0) AS inserted",
    [r, user.id, ref],
  );
  if (result.rows[0]?.inserted)
    await record(db, {
      severity: 2,
      event_type: "auth.staff.success",
      module: "auth",
      action: "Accès authentifié au restaurant",
      message: "Une session authentifiée a accédé à cet établissement.",
      actor_id: user.id,
      restaurant_id: r,
      session_id: ref,
      status: "success",
    });
}
