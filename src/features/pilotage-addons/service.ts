import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticated } from "@/features/platform/http";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { rows, type DB } from "@/infrastructure/database/db";
import { requirePermission } from "@/core/permissions";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { asEmail } from "@/features/messaging/contact";
import { messagingProviders, sendEmail } from "@/features/messaging/service";
import { proposalPdf } from "./proposal-document";
import { classifyCustomer } from "@/domain/crm/segments";
import { sendCampaignBatch } from "./campaign-delivery";
import { scheduleProposalFollowup } from "./automations";

const short = z.string().trim().min(1).max(180);
const optional = z.string().trim().max(300).optional();
export const crmActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("company"), name: short, siret: z.string().regex(/^\d{14}$/).optional(), activity: optional, city: optional, email: z.email().optional(), phone: optional }),
  z.object({ action: z.literal("contact"), companyId: z.string().uuid(), name: short, role: optional, email: z.email().optional(), phone: optional, notes: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("opportunity"), companyId: z.string().uuid(), customerId: z.string().min(1).max(180).optional(), title: short, amountCents: z.number().int().min(0).max(1_000_000_000), expectedOn: z.iso.date().optional() }),
  z.object({ action: z.literal("proposal"), id: z.string().uuid(), status: z.enum(["draft", "sent", "accepted", "declined"]), followUpAt: z.iso.datetime().nullable().optional() }),
  z.object({ action: z.literal("proposal-details"), id: z.string().uuid(), description: z.string().trim().max(300), validUntil: z.iso.date().nullable() }),
  z.object({ action: z.literal("send-proposal"), id: z.string().uuid() }),
  z.object({ action: z.literal("stage"), id: z.string().uuid(), stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]) }),
  z.object({ action: z.literal("activity"), opportunityId: z.string().uuid(), kind: z.enum(["task", "call", "email", "note", "meeting"]), title: z.string().trim().min(1).max(300), dueAt: z.iso.datetime().optional() }),
  z.object({ action: z.literal("complete-activity"), id: z.string().uuid() }),
  z.object({ action: z.literal("inquiry"), subject: short, body: z.string().trim().min(1).max(5000), companyId: z.string().uuid().optional(), customerId: z.string().min(1).max(180).optional(), opportunityId: z.string().uuid().optional(), source: z.enum(["manual", "website", "email", "phone", "other"]).default("manual") }),
  z.object({ action: z.literal("inquiry-status"), id: z.string().uuid(), status: z.enum(["new", "in_progress", "resolved"]) }),
  z.object({ action: z.literal("inquiry-assign"), id: z.string().uuid(), profileId: z.string().min(1).max(180).nullable() }),
  z.object({ action: z.literal("inquiry-to-proposal"), id: z.string().uuid(), amountCents: z.number().int().min(0).max(1_000_000_000) }),
  z.object({ action: z.literal("campaign-draft"), name: short, segment: z.enum(["new", "active", "loyal", "dormant"]), subject: z.string().trim().min(1).max(150), body: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal("campaign-update"), id: z.string().uuid(), name: short, segment: z.enum(["new", "active", "loyal", "dormant"]), subject: z.string().trim().min(1).max(150), body: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal("campaign-delete"), id: z.string().uuid() }),
  z.object({ action: z.literal("campaign-prepare"), id: z.string().uuid() }),
  z.object({ action: z.literal("campaign-send-batch"), id: z.string().uuid() }),
  z.object({ action: z.literal("automation-settings"), enabled: z.boolean(), days: z.number().int().min(1).max(30) }),
  z.object({ action: z.literal("inquiry-assignment-settings"), enabled: z.boolean(), profileId: z.string().min(1).max(180).nullable() }),
]);

async function access(db: DB, user: Actor, restaurant: string, addon: "pipeline-crm" | "customer-health") {
  const member = await scope(db, user, restaurant);
  requirePermission(member.roles ?? member.role, addon === "customer-health" ? "customers" : "analytics");
  await requirePaidAddon(db, restaurant, addon);
}

export const crmSegmentStats = (db: DB, restaurant: string) => rows<{ segment: string; customers: number; email_eligible: number }>(db, `
  WITH activity AS (
    SELECT c.id,c.contact,oc.email AS account_email,
      (c.consent OR coalesce(oc.marketing_consent,false)) AS marketing_consent,
      count(o.id)::int AS paid_orders,max(o.created_at) AS last_paid_at
    FROM customers c LEFT JOIN organization_customers oc ON oc.id=c.account_id
    LEFT JOIN shop_orders s ON s.customer_id=c.id AND s.payment_status='paid'
    LEFT JOIN orders o ON o.id=s.order_id AND o.restaurant_id=c.restaurant_id
    WHERE c.restaurant_id=$1
    GROUP BY c.id,c.contact,c.consent,oc.email,oc.marketing_consent
  ), classified AS (
    SELECT CASE WHEN paid_orders=0 THEN 'new'
      WHEN last_paid_at<now()-interval '90 days' THEN 'dormant'
      WHEN paid_orders>=3 THEN 'loyal' ELSE 'active' END AS segment,
      marketing_consent,
      CASE WHEN length(btrim(contact))<=254 AND btrim(contact) ~* '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]{2,}$' THEN lower(btrim(contact))
        WHEN length(btrim(coalesce(account_email,'')))<=254 AND btrim(coalesce(account_email,'')) ~* '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]{2,}$' THEN lower(btrim(account_email)) END AS recipient
    FROM activity
  ) SELECT segment,count(*)::int AS customers,count(DISTINCT recipient) FILTER (WHERE marketing_consent)::int AS email_eligible
    FROM classified GROUP BY segment`, [restaurant]);

export async function prepareCampaignAudience(db: DB, restaurant: string, campaignId: string) {
      const campaign = (await rows<{ segment: string }>(db, "SELECT segment FROM crm_campaigns WHERE restaurant_id=$1 AND id=$2 AND status='draft' FOR UPDATE", [restaurant, campaignId]))[0];
      if (!campaign) throw new Error("Brouillon introuvable ou déjà préparé.");
      await db.query(`WITH activity AS (
        SELECT c.id,c.contact,oc.email AS account_email,
          (c.consent OR coalesce(oc.marketing_consent,false)) AS marketing_consent,
          count(o.id)::int AS paid_orders,max(o.created_at) AS last_paid_at
        FROM customers c LEFT JOIN organization_customers oc ON oc.id=c.account_id
        LEFT JOIN shop_orders s ON s.customer_id=c.id AND s.payment_status='paid'
        LEFT JOIN orders o ON o.id=s.order_id AND o.restaurant_id=c.restaurant_id
        WHERE c.restaurant_id=$1
        GROUP BY c.id,c.contact,c.consent,oc.email,oc.marketing_consent
      ), classified AS (
        SELECT id,marketing_consent,
          CASE WHEN paid_orders=0 THEN 'new' WHEN last_paid_at<now()-interval '90 days' THEN 'dormant'
            WHEN paid_orders>=3 THEN 'loyal' ELSE 'active' END AS segment,
          CASE WHEN length(btrim(contact))<=254 AND btrim(contact) ~* '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]{2,}$' THEN lower(btrim(contact))
            WHEN length(btrim(coalesce(account_email,'')))<=254 AND btrim(coalesce(account_email,'')) ~* '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]{2,}$' THEN lower(btrim(account_email)) END AS recipient
        FROM activity
      ) INSERT INTO crm_campaign_recipients(id,restaurant_id,campaign_id,customer_id,recipient)
        SELECT gen_random_uuid()::text,$1,$2,a.id,a.recipient FROM (
          SELECT DISTINCT ON (recipient) id,recipient FROM classified
          WHERE segment=$3 AND marketing_consent AND recipient IS NOT NULL
          ORDER BY recipient,id
        ) a
        ON CONFLICT (campaign_id,customer_id) DO NOTHING`, [restaurant, campaignId, campaign.segment]);
      const audience = (await rows<{ total: number }>(db, "SELECT count(*)::int AS total FROM crm_campaign_recipients WHERE restaurant_id=$1 AND campaign_id=$2", [restaurant, campaignId]))[0];
      if (!audience?.total) throw new Error("Aucun destinataire éligible dans ce segment.");
      await db.query("UPDATE crm_campaigns SET status='prepared',prepared_at=now(),updated_at=now() WHERE restaurant_id=$1 AND id=$2", [restaurant, campaignId]);
}

export async function crmState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant, "pipeline-crm");
    const customers = await rows<{ id: string; name: string; contact: string; account_email: string | null; consent: boolean; points: number; marketing_consent: boolean; paid_orders: number; last_paid_at: string | null; spend_cents: number }>(db, `
      SELECT c.id,c.name,c.contact,oc.email AS account_email,c.consent,c.points,
        (c.consent OR coalesce(oc.marketing_consent,false)) AS marketing_consent,
        count(o.id)::int AS paid_orders,max(o.created_at)::text AS last_paid_at,
        coalesce(sum(s.total) FILTER (WHERE o.id IS NOT NULL),0)::int AS spend_cents
      FROM customers c LEFT JOIN organization_customers oc ON oc.id=c.account_id
      LEFT JOIN shop_orders s ON s.customer_id=c.id AND s.payment_status='paid'
      LEFT JOIN orders o ON o.id=s.order_id AND o.restaurant_id=c.restaurant_id
      WHERE c.restaurant_id=$1
      GROUP BY c.id,c.name,c.contact,c.consent,c.points,oc.email,oc.marketing_consent
      ORDER BY c.name LIMIT 1000`, [restaurant]);
    const segmentStats = await crmSegmentStats(db, restaurant);
    return {
      companies: await rows(db, "SELECT id,name,siret,activity,address,city,phone,email,website,source,score,score_signals,provenance,status,updated_at FROM crm_companies WHERE restaurant_id=$1 AND status<>'archived' ORDER BY updated_at DESC LIMIT 500", [restaurant]),
      automation: (await rows<{ proposal_followup_enabled: boolean; proposal_followup_days: number; inquiry_assignment_enabled: boolean; inquiry_assignee_id: string | null }>(db, "SELECT proposal_followup_enabled,proposal_followup_days,inquiry_assignment_enabled,inquiry_assignee_id FROM crm_automation_settings WHERE restaurant_id=$1", [restaurant]))[0] ?? { proposal_followup_enabled: false, proposal_followup_days: 3, inquiry_assignment_enabled: false, inquiry_assignee_id: null },
      proposalEmailAvailable: messagingProviders().email,
      deliveries: await rows(db, "SELECT id,opportunity_id,recipient,sent_at FROM crm_proposal_deliveries WHERE restaurant_id=$1 ORDER BY sent_at DESC LIMIT 500", [restaurant]),
      campaigns: await rows(db, `SELECT c.id,c.name,c.segment,c.subject,c.body,c.status,c.prepared_at,c.created_at,c.updated_at,
        (SELECT count(*)::int FROM crm_campaign_recipients r WHERE r.restaurant_id=c.restaurant_id AND r.campaign_id=c.id) AS recipient_count,
        (SELECT count(*)::int FROM crm_campaign_recipients r WHERE r.restaurant_id=c.restaurant_id AND r.campaign_id=c.id AND r.status='sent') AS sent_count,
        (SELECT count(*)::int FROM crm_campaign_recipients r WHERE r.restaurant_id=c.restaurant_id AND r.campaign_id=c.id AND r.status='skipped') AS skipped_count,
        (SELECT count(*)::int FROM crm_campaign_recipients r WHERE r.restaurant_id=c.restaurant_id AND r.campaign_id=c.id AND r.status='error') AS error_count
        FROM crm_campaigns c WHERE c.restaurant_id=$1 ORDER BY c.updated_at DESC LIMIT 200`, [restaurant]),
      segmentStats,
      contacts: await rows(db, "SELECT id,company_id,name,role,email,phone,notes,updated_at FROM crm_contacts WHERE restaurant_id=$1 ORDER BY updated_at DESC LIMIT 1000", [restaurant]),
      customers: customers.map(({ account_email, ...customer }) => ({ ...customer, ...classifyCustomer({ paidOrders: customer.paid_orders, lastPaidAt: customer.last_paid_at, marketingConsent: customer.marketing_consent, emailAvailable: Boolean(asEmail(customer.contact) ?? asEmail(account_email)) }) })),
      purchases: await rows(db, `SELECT s.order_id,s.customer_id,s.total,o.created_at
        FROM shop_orders s JOIN orders o ON o.id=s.order_id
        WHERE o.restaurant_id=$1 AND s.payment_status='paid' AND s.customer_id IS NOT NULL
        ORDER BY o.created_at DESC LIMIT 1000`, [restaurant]),
      messages: await rows(db, `SELECT m.id,m.customer_id,m.channel,m.purpose,m.subject,m.status,m.created_at
        FROM customer_messages m JOIN customers c ON c.id=m.customer_id AND c.restaurant_id=m.restaurant_id
        WHERE m.restaurant_id=$1 ORDER BY m.created_at DESC LIMIT 1000`, [restaurant]),
      supportCases: await rows(db, `SELECT id,customer_id,order_id,category,subject,status,created_at
        FROM customer_support_cases WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 1000`, [restaurant]),
      assignees: await rows(db, "SELECT DISTINCT p.id,p.name FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=$1 ORDER BY p.name LIMIT 200", [restaurant]),
      opportunities: await rows(db, "SELECT id,company_id,customer_id,title,stage,amount_cents,expected_on,proposal_status,proposal_sent_at,follow_up_at,proposal_description,valid_until,created_at,updated_at FROM crm_opportunities WHERE restaurant_id=$1 ORDER BY updated_at DESC LIMIT 500", [restaurant]),
      activities: await rows(db, "SELECT id,opportunity_id,kind,title,due_at,done_at,created_at FROM crm_activities WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 1000", [restaurant]),
      inquiries: await rows(db, "SELECT id,company_id,customer_id,opportunity_id,subject,body,sender_name,sender_email,source,status,assigned_to,created_at,updated_at FROM crm_inquiries WHERE restaurant_id=$1 ORDER BY updated_at DESC LIMIT 500", [restaurant]),
    };
  });
}

export async function crmPerform(restaurant: string, raw: unknown) {
  const action = crmActionSchema.parse(raw);
  await authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant, "pipeline-crm");
    if (action.action === "inquiry-assignment-settings") {
      const member = await scope(db, user, restaurant);
      requirePermission(member.roles ?? member.role, "customers");
      if (action.enabled && !action.profileId) throw new Error("Choisissez un responsable pour activer l’attribution.");
      if (action.profileId && !(await rows(db, `SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.profile_id
        WHERE m.restaurant_id=$1 AND m.profile_id=$2 AND p.status='active' LIMIT 1`, [restaurant, action.profileId])).length)
        throw new Error("Ce responsable ne fait pas partie de l’équipe active.");
      await db.query(`INSERT INTO crm_automation_settings(restaurant_id,inquiry_assignment_enabled,inquiry_assignee_id)
        VALUES($1,$2,$3) ON CONFLICT (restaurant_id) DO UPDATE SET inquiry_assignment_enabled=excluded.inquiry_assignment_enabled,
        inquiry_assignee_id=excluded.inquiry_assignee_id,updated_at=now()`, [restaurant, action.enabled, action.profileId]);
    } else if (action.action === "automation-settings") {
      const member = await scope(db, user, restaurant);
      requirePermission(member.roles ?? member.role, "customers");
      await db.query(`INSERT INTO crm_automation_settings(restaurant_id,proposal_followup_enabled,proposal_followup_days)
        VALUES($1,$2,$3) ON CONFLICT (restaurant_id) DO UPDATE SET proposal_followup_enabled=excluded.proposal_followup_enabled,
        proposal_followup_days=excluded.proposal_followup_days,updated_at=now()`, [restaurant, action.enabled, action.days]);
    } else if (action.action === "campaign-draft") {
      await db.query("INSERT INTO crm_campaigns(id,restaurant_id,name,segment,subject,body,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", [randomUUID(), restaurant, action.name, action.segment, action.subject, action.body, user.id]);
    } else if (action.action === "campaign-update") {
      const result = await db.query("UPDATE crm_campaigns SET name=$3,segment=$4,subject=$5,body=$6,updated_at=now() WHERE restaurant_id=$1 AND id=$2 AND status='draft' RETURNING id", [restaurant, action.id, action.name, action.segment, action.subject, action.body]);
      if (!result.rows.length) throw new Error("Brouillon introuvable dans cet établissement.");
    } else if (action.action === "campaign-delete") {
      const result = await db.query("DELETE FROM crm_campaigns WHERE restaurant_id=$1 AND id=$2 AND status='draft' RETURNING id", [restaurant, action.id]);
      if (!result.rows.length) throw new Error("Brouillon introuvable dans cet établissement.");
    } else if (action.action === "campaign-prepare") {
      await prepareCampaignAudience(db, restaurant, action.id);
    } else if (action.action === "campaign-send-batch") {
      const member = await scope(db, user, restaurant);
      requirePermission(member.roles ?? member.role, "customers");
      await sendCampaignBatch(db, restaurant, action.id, user.id);
    } else if (action.action === "company") {
      await db.query("INSERT INTO crm_companies(id,restaurant_id,name,siret,activity,city,email,phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [randomUUID(), restaurant, action.name, action.siret ?? null, action.activity ?? null, action.city ?? null, action.email ?? null, action.phone ?? null]);
    } else if (action.action === "contact") {
      await db.query("INSERT INTO crm_contacts(id,restaurant_id,company_id,name,role,email,phone,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [randomUUID(), restaurant, action.companyId, action.name, action.role ?? null, action.email ?? null, action.phone ?? null, action.notes ?? null]);
    } else if (action.action === "opportunity") {
      await db.query("INSERT INTO crm_opportunities(id,restaurant_id,company_id,customer_id,title,amount_cents,expected_on) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), restaurant, action.companyId, action.customerId ?? null, action.title, action.amountCents, action.expectedOn ?? null]);
    } else if (action.action === "proposal") {
      const result = await db.query("UPDATE crm_opportunities SET proposal_status=$3,follow_up_at=$4,updated_at=now() WHERE restaurant_id=$1 AND id=$2 AND ($3=proposal_status OR (proposal_status IN ('draft','sent') AND $3 IN ('accepted','declined'))) RETURNING id", [restaurant, action.id, action.status, action.followUpAt ?? null]);
      if (!result.rows.length) throw new Error("Proposition introuvable dans cet établissement.");
    } else if (action.action === "proposal-details") {
      const result = await db.query("UPDATE crm_opportunities SET proposal_description=$3,valid_until=$4,updated_at=now() WHERE restaurant_id=$1 AND id=$2 AND proposal_status='draft' RETURNING id", [restaurant, action.id, action.description, action.validUntil]);
      if (!result.rows.length) throw new Error("Proposition introuvable dans cet établissement.");
    } else if (action.action === "send-proposal") {
      if (!messagingProviders().email) throw new Error("Envoi email indisponible pour cet établissement.");
      const proposal = (await rows<{ id: string; title: string; amount_cents: number; proposal_description: string; valid_until: string | null; expired: boolean; proposal_status: string; created_at: string; expected_on: string | null; seller_name: string; seller_address: string; seller_phone: string; company_name: string; company_address: string | null; company_city: string | null; customer_name: string | null; recipient: string | null }>(db,
        `SELECT o.id,o.title,o.amount_cents,o.proposal_description,o.valid_until,(o.valid_until<current_date) AS expired,o.proposal_status,o.created_at,o.expected_on,
          r.name AS seller_name,r.address AS seller_address,r.phone AS seller_phone,
          c.name AS company_name,c.address AS company_address,c.city AS company_city,cu.name AS customer_name,
          (SELECT i.sender_email FROM crm_inquiries i WHERE i.restaurant_id=o.restaurant_id AND i.opportunity_id=o.id AND i.source='website' AND i.sender_email IS NOT NULL ORDER BY i.created_at DESC LIMIT 1) AS recipient
         FROM crm_opportunities o JOIN restaurants r ON r.id=o.restaurant_id
         JOIN crm_companies c ON c.id=o.company_id AND c.restaurant_id=o.restaurant_id
         LEFT JOIN customers cu ON cu.id=o.customer_id AND cu.restaurant_id=o.restaurant_id
         WHERE o.restaurant_id=$1 AND o.id=$2 FOR UPDATE OF o`, [restaurant, action.id]))[0];
      if (!proposal || proposal.proposal_status !== "draft" || proposal.expired || (await rows(db, "SELECT 1 FROM crm_proposal_deliveries WHERE restaurant_id=$1 AND opportunity_id=$2 LIMIT 1", [restaurant, action.id])).length) throw new Error("Proposition introuvable, expirée ou déjà envoyée.");
      const recipient = asEmail(proposal.recipient);
      if (!recipient) throw new Error("La proposition doit être liée à une demande du site avec un email valide.");
      const body = `Bonjour,\n\nSuite à votre demande, voici notre proposition : ${proposal.title}.\n${proposal.proposal_description ? `\n${proposal.proposal_description}\n` : ""}\nMontant estimé TTC : ${(proposal.amount_cents / 100).toFixed(2)} €.${proposal.valid_until ? `\nValable jusqu’au ${new Date(proposal.valid_until).toLocaleDateString("fr-FR")}.` : ""}\n\nCette proposition est indicative. Les conditions et taxes applicables seront confirmées avant tout devis contractuel.\n\n${proposal.seller_name}`;
      const pdf = await proposalPdf(proposal);
      const providerId = await sendEmail(recipient, `Proposition de ${proposal.seller_name}`, body, `${proposal.seller_name.replace(/[<>\"]/g, "")} <${process.env.EMAIL_FROM}>`, {
        attachment: { filename: `proposition-${action.id}.pdf`, content: pdf },
        idempotencyKey: `crm-proposal-${restaurant}-${action.id}`,
      });
      await db.query("INSERT INTO crm_proposal_deliveries(id,restaurant_id,opportunity_id,recipient,provider_id,sent_by) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), restaurant, action.id, recipient, providerId, user.id]);
      await db.query("UPDATE crm_opportunities SET proposal_status='sent',proposal_sent_at=now(),updated_at=now() WHERE restaurant_id=$1 AND id=$2", [restaurant, action.id]);
      await scheduleProposalFollowup(db, restaurant, action.id, user.id);
    } else if (action.action === "stage") {
      const result = await db.query("UPDATE crm_opportunities SET stage=$3,updated_at=now() WHERE restaurant_id=$1 AND id=$2 RETURNING id", [restaurant, action.id, action.stage]);
      if (!result.rows.length) throw new Error("Opportunité introuvable dans cet établissement.");
    } else if (action.action === "activity") {
      await db.query("INSERT INTO crm_activities(id,restaurant_id,opportunity_id,kind,title,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), restaurant, action.opportunityId, action.kind, action.title, action.dueAt ?? null, user.id]);
    } else if (action.action === "inquiry") {
      await db.query("INSERT INTO crm_inquiries(id,restaurant_id,company_id,customer_id,opportunity_id,subject,body,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [randomUUID(), restaurant, action.companyId ?? null, action.customerId ?? null, action.opportunityId ?? null, action.subject, action.body, action.source]);
    } else if (action.action === "inquiry-status") {
      const result = await db.query("UPDATE crm_inquiries SET status=$3,updated_at=now() WHERE restaurant_id=$1 AND id=$2 RETURNING id", [restaurant, action.id, action.status]);
      if (!result.rows.length) throw new Error("Demande introuvable dans cet établissement.");
    } else if (action.action === "inquiry-assign") {
      const result = await db.query("UPDATE crm_inquiries SET assigned_to=$3,updated_at=now() WHERE restaurant_id=$1 AND id=$2 AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM memberships WHERE restaurant_id=$1 AND profile_id=$3)) RETURNING id", [restaurant, action.id, action.profileId]);
      if (!result.rows.length) throw new Error("Demande ou membre introuvable dans cet établissement.");
    } else if (action.action === "inquiry-to-proposal") {
      const inquiry = (await rows<{ company_id: string | null; customer_id: string | null; opportunity_id: string | null; subject: string; customer_name: string | null }>(db,
        "SELECT i.company_id,i.customer_id,i.opportunity_id,i.subject,c.name AS customer_name FROM crm_inquiries i LEFT JOIN customers c ON c.id=i.customer_id AND c.restaurant_id=i.restaurant_id WHERE i.restaurant_id=$1 AND i.id=$2 FOR UPDATE OF i", [restaurant, action.id]))[0];
      if (!inquiry || inquiry.opportunity_id) throw new Error("Demande introuvable ou déjà transformée.");
      let companyId = inquiry.company_id;
      if (!companyId) {
        companyId = randomUUID();
        await db.query("INSERT INTO crm_companies(id,restaurant_id,name,source) VALUES($1,$2,$3,'manual')", [companyId, restaurant, inquiry.customer_name ?? "Prospect à identifier"]);
      }
      const opportunityId = randomUUID();
      await db.query("INSERT INTO crm_opportunities(id,restaurant_id,company_id,customer_id,title,amount_cents,stage,proposal_status) VALUES($1,$2,$3,$4,$5,$6,'proposal','draft')",
        [opportunityId, restaurant, companyId, inquiry.customer_id, inquiry.subject, action.amountCents]);
      await db.query("UPDATE crm_inquiries SET company_id=$3,opportunity_id=$4,status='in_progress',updated_at=now() WHERE restaurant_id=$1 AND id=$2", [restaurant, action.id, companyId, opportunityId]);
    } else {
      const result = await db.query("UPDATE crm_activities SET done_at=now() WHERE restaurant_id=$1 AND id=$2 AND done_at IS NULL RETURNING id", [restaurant, action.id]);
      if (!result.rows.length) throw new Error("Activité introuvable ou déjà terminée.");
    }
  });
  return crmState(restaurant);
}

export async function crmProposalDetails(restaurant: string, opportunityId: string) {
  if (!z.uuid().safeParse(opportunityId).success) throw new Error("Proposition invalide.");
  return authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant, "pipeline-crm");
    const detail = (await rows<{ id: string; title: string; amount_cents: number; proposal_status: string; proposal_description: string; valid_until: string | null; created_at: string; expected_on: string | null; company_name: string; company_address: string | null; company_city: string | null; customer_name: string | null; seller_name: string; seller_address: string; seller_phone: string }>(db,
      `SELECT o.id,o.title,o.amount_cents,o.proposal_status,o.proposal_description,o.valid_until,o.created_at,o.expected_on,
        c.name AS company_name,c.address AS company_address,c.city AS company_city,
        cu.name AS customer_name,r.name AS seller_name,r.address AS seller_address,r.phone AS seller_phone
       FROM crm_opportunities o JOIN crm_companies c ON c.id=o.company_id AND c.restaurant_id=o.restaurant_id
       JOIN restaurants r ON r.id=o.restaurant_id
       LEFT JOIN customers cu ON cu.id=o.customer_id AND cu.restaurant_id=o.restaurant_id
       WHERE o.restaurant_id=$1 AND o.id=$2`, [restaurant, opportunityId]))[0];
    if (!detail) throw new Error("Proposition introuvable dans cet établissement.");
    return detail;
  });
}

type HealthRow = { id: string; name: string; contact: string; consent: boolean; points: number; orders: number; orders_90d: number; ltv_cents: number; last_order_at: string | null; first_order_at: string | null };
export function customerHealthScore(row: Pick<HealthRow, "orders_90d" | "points" | "last_order_at">, now = Date.now()) {
  const age = row.last_order_at ? (now - Date.parse(row.last_order_at)) / 86_400_000 : Infinity;
  const recency = age <= 30 ? 50 : age <= 90 ? 35 : age <= 180 ? 15 : 0;
  const frequency = Math.min(35, row.orders_90d * 12);
  const loyalty = Math.min(15, Math.floor(row.points / 20));
  return { total: recency + frequency + loyalty, recency, frequency, loyalty };
}

export async function customerHealthState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant, "customer-health");
    const customers = await rows<HealthRow>(db, `
      SELECT c.id,c.name,c.contact,c.consent,c.points,
        count(o.id)::int AS orders,
        count(o.id) FILTER (WHERE o.created_at>=now()-interval '90 days')::int AS orders_90d,
        coalesce(sum(s.total),0)::int AS ltv_cents,
        max(o.created_at)::text AS last_order_at,
        min(o.created_at)::text AS first_order_at
      FROM customers c
      LEFT JOIN shop_orders s ON s.customer_id=c.id AND s.payment_status='paid'
      LEFT JOIN orders o ON o.id=s.order_id AND o.restaurant_id=c.restaurant_id
      WHERE c.restaurant_id=$1
      GROUP BY c.id,c.name,c.contact,c.consent,c.points
      ORDER BY max(o.created_at) DESC NULLS LAST,c.name LIMIT 500`, [restaurant]);
    const trend = await rows<{ month: string; revenue_cents: number; orders: number }>(db, `
      SELECT to_char(date_trunc('month',o.created_at),'YYYY-MM') AS month,
        sum(s.total)::int AS revenue_cents,count(*)::int AS orders
      FROM shop_orders s JOIN orders o ON o.id=s.order_id
      WHERE o.restaurant_id=$1 AND s.payment_status='paid' AND s.customer_id IS NOT NULL
        AND o.created_at>=date_trunc('month',now())-interval '5 months'
      GROUP BY 1 ORDER BY 1`, [restaurant]);
    return {
      customers: customers.map((row) => ({ ...row, health: customerHealthScore(row) })),
      trend,
      definition: "LTV = somme des commandes en ligne payées liées au client ; score = récence (50), commandes des 90 derniers jours (35), points de fidélité (15).",
    };
  });
}
