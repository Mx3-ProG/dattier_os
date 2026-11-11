import nodemailer from "nodemailer";
import { productionEnabled } from "@/lib/database/db";
import { decryptSecret } from "@/features/integrations/security";
import type { ClaimedMessage, DeliveryContext, EmailTransport, OutgoingEmail, TransportPort } from "../engine/port";
import { resolvePublicHost } from "./guard";

/** Fournisseur de chiffrement : le secret SMTP est lié à l'établissement (AAD). */
export const SMTP_SECRET_PROVIDER = "email-smtp";

type SmtpTarget = {
  host: string;
  /** Adresse vérifiée à laquelle se connecter ; le nom reste utilisé pour TLS. */
  address?: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

/**
 * SMTP de la plateforme : les mêmes identifiants que ceux saisis dans Supabase Auth
 * (Authentication → Emails → SMTP Settings). Variables `EMAIL_SMTP_*` ; à défaut, le
 * relais SMTP de Resend avec `RESEND_API_KEY` (configuration recommandée pour Supabase).
 */
export function platformSmtp(): SmtpTarget | null {
  const from = process.env.EMAIL_SMTP_FROM || process.env.EMAIL_FROM || "";
  if (!from) return null;
  if (process.env.EMAIL_SMTP_HOST && process.env.EMAIL_SMTP_PASSWORD) {
    const port = Number(process.env.EMAIL_SMTP_PORT || 465);
    return {
      host: process.env.EMAIL_SMTP_HOST,
      port,
      secure: port === 465,
      user: process.env.EMAIL_SMTP_USER || "",
      pass: process.env.EMAIL_SMTP_PASSWORD,
      from,
    };
  }
  if (process.env.RESEND_API_KEY)
    return { host: "smtp.resend.com", port: 465, secure: true, user: "resend", pass: process.env.RESEND_API_KEY, from };
  return null;
}

const clean = (value: string) => value.replace(/[\r\n<>"]/g, "").trim().slice(0, 120);

function smtpTransport(kind: EmailTransport["kind"], target: SmtpTarget, live: boolean): EmailTransport {
  return {
    kind,
    live,
    async send(email: OutgoingEmail) {
      const transporter = nodemailer.createTransport({
        host: target.address ?? target.host,
        port: target.port,
        secure: target.secure,
        requireTLS: !target.secure,
        auth: target.user || target.pass ? { user: target.user, pass: target.pass } : undefined,
        tls: { servername: target.host, minVersion: "TLSv1.2" },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      try {
        const info = await transporter.sendMail({
          from: { name: clean(email.fromName) || "STUDIO OS", address: target.from },
          to: email.to,
          replyTo: email.replyTo || undefined,
          subject: email.subject,
          html: email.html,
          text: email.text,
          messageId: `<${email.messageId}@${target.from.split("@")[1] ?? "studio-os"}>`,
          headers: email.headers,
        });
        return { providerId: typeof info.messageId === "string" ? info.messageId.slice(0, 200) : null };
      } finally {
        transporter.close();
      }
    },
  };
}

/** Transport utilisé sans envoi réel : la démonstration ou un SMTP plateforme absent. */
export const tracedTransport = (kind: EmailTransport["kind"]): EmailTransport => ({
  kind,
  live: false,
  send: async () => ({ providerId: null }),
});

/** Transport d'un SMTP saisi par l'établissement, après vérification de l'adresse. */
export async function customTransport(
  restaurant: string,
  config: { host: string; port: number; security: "tls" | "starttls"; username: string | null; password: string; fromEmail: string },
  live = true,
) {
  const address = await resolvePublicHost(config.host);
  return smtpTransport(
    "custom",
    {
      host: config.host,
      address,
      port: config.port,
      secure: config.security === "tls",
      user: config.username ?? "",
      pass: config.password,
      from: config.fromEmail,
    },
    live,
  );
}

/**
 * Choix du transport d'un message (port `TransportPort` du moteur).
 * En démonstration, seuls les tests vers une adresse saisie à la main partent réellement,
 * par le SMTP de l'établissement : les fiches clients fictives ne reçoivent jamais rien.
 */
export const resolveTransport: TransportPort = async (
  restaurant: string,
  message: ClaimedMessage,
  context: DeliveryContext,
) => {
  const config = context.transport;
  const production = productionEnabled();
  if (config?.mode === "custom" && config.host && config.port && config.security && config.from_email) {
    const live = production || message.origin === "test";
    if (!live) return tracedTransport("custom");
    const password = config.secret ? String(decryptSecret(restaurant, SMTP_SECRET_PROVIDER, config.secret)) : "";
    return customTransport(
      restaurant,
      { host: config.host, port: config.port, security: config.security, username: config.username, password, fromEmail: config.from_email },
      live,
    );
  }
  const platform = platformSmtp();
  return platform && production ? smtpTransport("platform", platform, true) : tracedTransport("platform");
};
