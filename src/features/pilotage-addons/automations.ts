import { randomUUID } from "node:crypto";
import { rows, type DB } from "@/infrastructure/database/db";

/** Creates one internal CRM task after a proposal is sent, if this commerce opted in. */
export async function scheduleProposalFollowup(db: DB, restaurant: string, opportunityId: string, actorId: string) {
  const scheduled = await rows<{ due_at: string }>(db, `INSERT INTO crm_activities(id,restaurant_id,opportunity_id,kind,title,due_at,created_by,automation_key)
    SELECT $1,o.restaurant_id,o.id,'task','Relancer la proposition : ' || o.title,
      now() + make_interval(days => s.proposal_followup_days),$4,'proposal-followup:' || o.id
    FROM crm_opportunities o JOIN crm_automation_settings s ON s.restaurant_id=o.restaurant_id
    WHERE o.restaurant_id=$2 AND o.id=$3 AND o.proposal_status='sent'
      AND o.follow_up_at IS NULL AND s.proposal_followup_enabled
    ON CONFLICT DO NOTHING RETURNING due_at`, [randomUUID(), restaurant, opportunityId, actorId]);
  if (scheduled[0]) await db.query("UPDATE crm_opportunities SET follow_up_at=$3,updated_at=now() WHERE restaurant_id=$1 AND id=$2 AND follow_up_at IS NULL", [restaurant, opportunityId, scheduled[0].due_at]);
  return Boolean(scheduled[0]);
}
