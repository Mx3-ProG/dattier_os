import { randomUUID as uuid } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { productionEnabled } from "@/infrastructure/database/db";
import type { Actor } from "@/infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { asEmail, asPhone, commercial, optOut, type Channel } from "./contact";

export const messageSchema = z
  .object({
    action: z.literal("messageCustomer"),
    id: z.string().min(1),
    channel: z.enum(["email", "sms"]),
    purpose: z.enum(["relance", "offre", "information"]),
    subject: z.string().trim().max(150).optional(),
    body: z.string().trim().min(1).max(5000),
  })
  .refine((m) => m.channel === "sms" || !!m.subject, {
    message: "Objet requis pour un email.",
    path: ["subject"],
  })
  .refine((m) => m.channel === "email" || m.body.length <= 640, {
    message: "SMS limité à 640 caractères.",
    path: ["body"],
  });

type Target = {
  name: string;
  contact: string;
  consent: boolean;
  account_email: string | null;
  marketing_consent: boolean | null;
  restaurant: string;
};

/** Fournisseurs réellement branchés. Sans clé (ou en démo locale), l’envoi est tracé mais pas expédié. */
export function messagingProviders() {
  const live = productionEnabled();
  return {
    email: live && !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM,
    sms:
      live &&
      !!process.env.TWILIO_ACCOUNT_SID &&
      !!process.env.TWILIO_AUTH_TOKEN &&
      !!process.env.TWILIO_FROM,
  };
}

export function recipientOf(
  t: Pick<Target, "contact" | "account_email">,
  channel: Channel,
) {
  return channel === "email"
    ? (asEmail(t.contact) ?? asEmail(t.account_email))
    : asPhone(t.contact);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  from: string,
  options: { attachment?: { filename: string; content: Buffer }; idempotencyKey?: string } = {},
) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`,
      ...(options.attachment ? { attachments: [{ filename: options.attachment.filename, content: options.attachment.content.toString("base64") }] } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  const d = (await r.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!r.ok)
    throw new Error(d.message || `Fournisseur email : erreur ${r.status}`);
  return d.id ?? null;
}

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: process.env.TWILIO_FROM!,
        Body: body,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const d = (await r.json().catch(() => ({}))) as {
    sid?: string;
    message?: string;
  };
  if (!r.ok)
    throw new Error(d.message || `Fournisseur SMS : erreur ${r.status}`);
  return d.sid ?? null;
}

export type MessageResult = {
  status: "demo" | "sent" | "error";
  channel: Channel;
  recipient: string;
  error?: string;
};

/**
 * Envoie un email ou un SMS à un client de l’établissement et trace l’envoi.
 * Une erreur du fournisseur est enregistrée (statut « error ») sans annuler la trace.
 */
export async function messageCustomer(
  db: DB,
  r: string,
  user: Actor,
  m: z.infer<typeof messageSchema>,
): Promise<MessageResult> {
  requirePermission(user.roles ?? user.role, "customers");
  const t = await one<Target>(
    db,
    `SELECT c.name,c.contact,c.consent,oc.email AS account_email,oc.marketing_consent,r.name AS restaurant
     FROM customers c JOIN restaurants r ON r.id=c.restaurant_id
     LEFT JOIN organization_customers oc ON oc.id=c.account_id
     WHERE c.id=$1 AND c.restaurant_id=$2`,
    [m.id, r],
  );
  if (commercial(m.purpose) && !t.consent && !t.marketing_consent)
    throw new Error(
      "Ce client n’a pas donné son accord : seuls les messages d’information sont possibles.",
    );
  const recipient = recipientOf(t, m.channel);
  if (!recipient)
    throw new Error(
      m.channel === "email"
        ? "Aucune adresse email valide sur cette fiche."
        : "Aucun numéro de mobile valide sur cette fiche.",
    );
  const recent = await rows(
    db,
    "SELECT 1 FROM customer_messages WHERE customer_id=$1 AND channel=$2 AND status<>'error' AND created_at>now()-interval '2 minutes'",
    [m.id, m.channel],
  );
  if (recent.length)
    throw new Error(
      "Un message vient déjà d’être envoyé à ce client. Patientez deux minutes.",
    );

  const body = commercial(m.purpose)
    ? `${m.body}\n\n${optOut(m.channel)}`
    : m.body;
  const subject = m.channel === "email" ? m.subject! : null;
  const live = messagingProviders()[m.channel];
  let status: MessageResult["status"] = "demo",
    providerId: string | null = null,
    error: string | undefined;
  if (live)
    try {
      providerId =
        m.channel === "email"
          ? await sendEmail(
              recipient,
              subject!,
              body,
              `${t.restaurant.replace(/[<>"]/g, "")} <${process.env.EMAIL_FROM}>`,
            )
          : await sendSms(recipient, body);
      status = "sent";
    } catch (e) {
      status = "error";
      error = ((e as Error).message || "Envoi impossible").slice(0, 300);
    }
  await db.query(
    `INSERT INTO customer_messages(id,restaurant_id,customer_id,channel,purpose,recipient,subject,body,status,provider_id,error,actor)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      uuid(),
      r,
      m.id,
      m.channel,
      m.purpose,
      recipient,
      subject,
      body,
      status,
      providerId,
      error ?? null,
      user.id,
    ],
  );
  return { status, channel: m.channel, recipient, error };
}

export type CustomerMessage = {
  id: string;
  customer_id: string;
  customer_name: string;
  channel: Channel;
  purpose: "relance" | "offre" | "information";
  recipient: string;
  subject: string | null;
  body: string;
  status: "demo" | "sent" | "error";
  error: string | null;
  actor_name: string | null;
  created_at: string;
};

export const recentMessages = (db: DB, r: string) =>
  rows<CustomerMessage>(
    db,
    `SELECT m.id,m.customer_id,c.name AS customer_name,m.channel,m.purpose,m.recipient,m.subject,m.body,m.status,m.error,p.name AS actor_name,m.created_at
     FROM customer_messages m JOIN customers c ON c.id=m.customer_id LEFT JOIN profiles p ON p.id=m.actor
     WHERE m.restaurant_id=$1 ORDER BY m.created_at DESC LIMIT 60`,
    [r],
  );
