import { randomUUID } from "node:crypto";
import { asEmail, optOut } from "@/features/messaging/contact";
import { messagingProviders, sendEmail } from "@/features/messaging/service";
import { rows, type DB } from "@/infrastructure/database/db";

type Recipient = { id: string; customer_id: string; recipient: string; contact: string; account_email: string | null; consent: boolean; marketing_consent: boolean | null };

export function recipientStillEligible(recipient: Pick<Recipient, "recipient" | "contact" | "account_email" | "consent" | "marketing_consent">) {
  return (recipient.consent || Boolean(recipient.marketing_consent)) &&
    (asEmail(recipient.contact) ?? asEmail(recipient.account_email)) === recipient.recipient;
}

/** Sends at most five messages per explicit manager action. Caller owns the transaction and access check. */
export async function sendCampaignBatch(db: DB, restaurant: string, campaignId: string, senderId: string) {
  if (!messagingProviders().email) throw new Error("Envoi e-mail indisponible.");
  const campaign = (await rows<{ subject: string; body: string; status: string; seller_name: string }>(db,
    `SELECT c.subject,c.body,c.status,r.name AS seller_name FROM crm_campaigns c
     JOIN restaurants r ON r.id=c.restaurant_id WHERE c.restaurant_id=$1 AND c.id=$2 FOR UPDATE OF c`, [restaurant, campaignId]))[0];
  if (!campaign || !["prepared", "sending"].includes(campaign.status)) throw new Error("Campagne non préparée ou déjà terminée.");
  const recipients = await rows<Recipient>(db, `
    SELECT cr.id,cr.customer_id,cr.recipient,c.contact,c.consent,oc.email AS account_email,oc.marketing_consent
    FROM crm_campaign_recipients cr JOIN customers c ON c.id=cr.customer_id AND c.restaurant_id=cr.restaurant_id
    LEFT JOIN organization_customers oc ON oc.id=c.account_id
    WHERE cr.restaurant_id=$1 AND cr.campaign_id=$2 AND cr.status='pending'
    ORDER BY cr.created_at,cr.id LIMIT 5 FOR UPDATE OF cr`, [restaurant, campaignId]);
  for (const recipient of recipients) {
    if (!recipientStillEligible(recipient)) {
      await db.query("UPDATE crm_campaign_recipients SET status='skipped',attempted_at=now(),error='Accord ou adresse modifiés' WHERE id=$1 AND restaurant_id=$2", [recipient.id, restaurant]);
      continue;
    }
    try {
      const message = `${campaign.body}\n\n${optOut("email")}`;
      const providerId = await sendEmail(recipient.recipient, campaign.subject,
        message,
        `${campaign.seller_name.replace(/[<>\"]/g, "")} <${process.env.EMAIL_FROM}>`,
        { idempotencyKey: `crm-campaign-${campaignId}-${recipient.id}` });
      await db.query(`INSERT INTO customer_messages(id,restaurant_id,customer_id,channel,purpose,recipient,subject,body,status,provider_id,actor)
        VALUES($1,$2,$3,'email','offre',$4,$5,$6,'sent',$7,$8)`,
        [randomUUID(), restaurant, recipient.customer_id, recipient.recipient, campaign.subject, message, providerId, senderId]);
      await db.query("UPDATE crm_campaign_recipients SET status='sent',attempted_at=now(),sent_at=now(),provider_id=$3,error=NULL WHERE id=$1 AND restaurant_id=$2", [recipient.id, restaurant, providerId]);
    } catch (error) {
      await db.query("UPDATE crm_campaign_recipients SET status='error',attempted_at=now(),error=$3 WHERE id=$1 AND restaurant_id=$2", [recipient.id, restaurant, ((error as Error).message || "Envoi impossible").slice(0, 300)]);
    }
  }
  const pending = (await rows<{ total: number }>(db, "SELECT count(*)::int AS total FROM crm_campaign_recipients WHERE restaurant_id=$1 AND campaign_id=$2 AND status='pending'", [restaurant, campaignId]))[0]?.total ?? 0;
  await db.query("UPDATE crm_campaigns SET status=$3,updated_at=now() WHERE restaurant_id=$1 AND id=$2", [restaurant, campaignId, pending ? "sending" : "completed"]);
}
