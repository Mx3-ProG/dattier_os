/**
 * Contrats du moteur d'envoi. Le moteur ne connaît ni l'identité visuelle ni le SMTP :
 * il reçoit un « rendu » et un « transport » par ces deux ports, branchés par
 * `src/features/email/index.ts`. Chaque brique se remplace sans toucher aux autres.
 */
export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  replyTo?: string;
  /** Identifiant stable du message : en-tête Message-ID, évite les doublons côté serveur. */
  messageId: string;
  headers?: Record<string, string>;
};

export type TransportKind = "platform" | "custom";

export interface EmailTransport {
  kind: TransportKind;
  /** false : aucun envoi réel (démonstration, SMTP plateforme absent), le message est tracé. */
  live: boolean;
  send(email: OutgoingEmail): Promise<{ providerId: string | null }>;
}

/** Message réclamé dans la file, prêt à être rendu. */
export type ClaimedMessage = {
  id: string;
  origin: "automation" | "manual" | "test";
  template_key: string;
  recipient: string;
  vars: Record<string, unknown>;
  attempts: number;
};

/** Contexte de livraison d'un établissement (app.email_delivery_context). */
export type DeliveryContext = {
  restaurant: { name: string } | null;
  brand: unknown;
  templates: Record<string, { name: string; category: "transactional" | "marketing"; content: unknown }>;
  transport: {
    mode: TransportKind;
    host: string | null;
    port: number | null;
    security: "tls" | "starttls" | null;
    username: string | null;
    secret: string | null;
    from_email: string | null;
    from_name: string | null;
  } | null;
};

export type Rendered = {
  subject: string;
  html: string;
  text: string;
  fromName: string;
  replyTo?: string;
  marketing: boolean;
};

/** Port de rendu : fourni par la brique « personnalisation ». */
export type RenderPort = (message: ClaimedMessage, context: DeliveryContext) => Rendered;
/** Port de transport : fourni par la brique « configuration SMTP ». */
export type TransportPort = (restaurant: string, message: ClaimedMessage, context: DeliveryContext) => Promise<EmailTransport>;
