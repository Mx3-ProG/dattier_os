import { z } from "zod";

/**
 * Configuration SMTP d'un établissement (table `email_transports`).
 * Pur : partagé par l'écran et le serveur. Le mot de passe n'est jamais renvoyé à l'écran.
 *
 * - `platform` : le SMTP de la plateforme, le même que celui branché sur Supabase Auth
 *   pour les emails de connexion. L'adresse d'expédition est celle de la plateforme,
 *   les réponses des clients vont à l'adresse de réponse de l'établissement.
 * - `custom` : le serveur SMTP de l'établissement (Google Workspace, OVH, Brevo…).
 */
export const smtpPorts = [465, 587, 2525, 25] as const;

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Nom d'hôte SMTP invalide (ex. smtp.exemple.fr).");

export const transportSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("platform") }).strict(),
  z
    .object({
      mode: z.literal("custom"),
      host: hostname,
      port: z.union([z.literal(465), z.literal(587), z.literal(2525), z.literal(25)]),
      security: z.enum(["tls", "starttls"]),
      username: z.string().trim().max(254).default(""),
      /** Vide : conserver le mot de passe déjà enregistré. */
      password: z.string().max(500).default(""),
      fromEmail: z.email("Adresse d'expédition invalide.").max(254),
      fromName: z
        .string()
        .trim()
        .max(120)
        .refine((value) => !/[\r\n<>"]/.test(value), "Caractères interdits dans le nom d'expéditeur.")
        .default(""),
    })
    .strict()
    .refine((value) => !(value.port === 465 && value.security === "starttls"), {
      message: "Le port 465 utilise TLS direct.",
      path: ["security"],
    }),
]);
export type TransportInput = z.infer<typeof transportSchema>;

/** Vue sans secret, renvoyée à l'écran. */
export type TransportView = {
  mode: "platform" | "custom";
  host: string | null;
  port: number | null;
  security: "tls" | "starttls" | null;
  username: string | null;
  fromEmail: string | null;
  fromName: string | null;
  hasPassword: boolean;
  verifiedAt: string | null;
  lastError: string | null;
};

export const defaultTransport: TransportView = {
  mode: "platform",
  host: null,
  port: null,
  security: null,
  username: null,
  fromEmail: null,
  fromName: null,
  hasPassword: false,
  verifiedAt: null,
  lastError: null,
};
