import { z } from "zod";

/**
 * Modèles d'emails (table `email_templates`) et catalogue des déclencheurs automatiques.
 * Module pur, partagé par le serveur et l'écran.
 *
 * Un déclencheur sans ligne en base utilise son modèle par défaut et reste désactivé :
 * aucun établissement n'envoie d'email automatique sans l'avoir choisi.
 */
export const templateContentSchema = z
  .object({
    subject: z.string().trim().min(1, "Objet requis.").max(150),
    preheader: z.string().trim().max(150).default(""),
    heading: z.string().trim().max(150).default(""),
    body: z.string().trim().min(1, "Message requis.").max(5000),
    buttonLabel: z.string().trim().max(60).default(""),
    buttonUrl: z
      .string()
      .trim()
      .max(500)
      .refine((value) => value === "" || /^(https:\/\/|\{\{)[^\s"'<>]*$/.test(value), "Lien https:// ou variable requis.")
      .default(""),
  })
  .strict();
export type TemplateContent = z.infer<typeof templateContentSchema>;
export type TemplateCategory = "transactional" | "marketing";

export type TemplateVariable = { key: string; label: string; example: string };

const restaurantVars: TemplateVariable[] = [
  { key: "etablissement", label: "Nom de l'établissement", example: "Le Dattier" },
  { key: "client", label: "Prénom ou nom du client", example: "Camille" },
];
const reservationVars: TemplateVariable[] = [
  ...restaurantVars,
  { key: "date", label: "Date de la réservation", example: "vendredi 14 novembre" },
  { key: "heure", label: "Heure", example: "20:00" },
  { key: "couverts", label: "Nombre de personnes", example: "4" },
];

export type TriggerDefinition = {
  key: string;
  label: string;
  description: string;
  category: TemplateCategory;
  variables: TemplateVariable[];
  defaults: TemplateContent;
};

/** Événements métier qui peuvent envoyer un email sans intervention. */
export const emailTriggers = [
  {
    key: "reservation.requested",
    label: "Demande de réservation reçue",
    description: "Envoyé au client dès qu'il demande une table depuis votre site.",
    category: "transactional",
    variables: reservationVars,
    defaults: {
      subject: "Nous avons bien reçu votre demande, {{client}}",
      preheader: "Votre demande pour {{couverts}} personnes est en cours de traitement.",
      heading: "Merci pour votre demande",
      body: "Bonjour {{client}},\n\nNous avons bien reçu votre demande de réservation pour {{couverts}} personnes, le {{date}} à {{heure}}.\n\nNous revenons vers vous très vite pour la confirmer.\n\nÀ bientôt,\nL'équipe {{etablissement}}",
      buttonLabel: "",
      buttonUrl: "",
    },
  },
  {
    key: "reservation.confirmed",
    label: "Réservation confirmée",
    description: "Envoyé quand votre équipe confirme la réservation.",
    category: "transactional",
    variables: reservationVars,
    defaults: {
      subject: "C'est confirmé : à {{heure}} le {{date}}",
      preheader: "Votre table pour {{couverts}} personnes vous attend.",
      heading: "Votre réservation est confirmée",
      body: "Bonjour {{client}},\n\nBonne nouvelle : votre réservation pour {{couverts}} personnes le {{date}} à {{heure}} est confirmée.\n\nEn cas d'empêchement, répondez simplement à cet email.\n\nÀ très vite,\nL'équipe {{etablissement}}",
      buttonLabel: "",
      buttonUrl: "",
    },
  },
  {
    key: "reservation.cancelled",
    label: "Réservation annulée",
    description: "Envoyé quand une réservation est annulée ou refusée.",
    category: "transactional",
    variables: reservationVars,
    defaults: {
      subject: "Votre réservation du {{date}}",
      preheader: "Information sur votre réservation.",
      heading: "Réservation annulée",
      body: "Bonjour {{client}},\n\nVotre réservation du {{date}} à {{heure}} est annulée. Nous espérons vous accueillir une prochaine fois.\n\nL'équipe {{etablissement}}",
      buttonLabel: "",
      buttonUrl: "",
    },
  },
] as const satisfies readonly TriggerDefinition[];
export type TriggerKey = (typeof emailTriggers)[number]["key"];
export const isTriggerKey = (value: string): value is TriggerKey =>
  emailTriggers.some((trigger) => trigger.key === value);
export const triggerFor = (key: string): TriggerDefinition | undefined =>
  emailTriggers.find((trigger) => trigger.key === key);

/** Modèle libre (campagne, information) créé par l'établissement. */
export const customTemplateKey = /^custom-[a-z0-9-]{1,40}$/;
export const customVariables: TemplateVariable[] = restaurantVars;

export const defaultCustomContent: TemplateContent = {
  subject: "Des nouvelles de {{etablissement}}",
  preheader: "",
  heading: "Bonjour {{client}}",
  body: "Écrivez ici votre message.\n\nÀ bientôt,\nL'équipe {{etablissement}}",
  buttonLabel: "",
  buttonUrl: "",
};

/** Contenu stocké, relu avec tolérance : un champ invalide reprend la valeur par défaut. */
export function readContent(raw: unknown, fallback: TemplateContent): TemplateContent {
  const parsed = templateContentSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const content: Record<string, unknown> = { ...fallback };
  // Un champ absent garde la valeur de repli (le défaut du schéma serait une chaîne vide).
  for (const key of Object.keys(fallback) as (keyof TemplateContent)[]) {
    if (!(key in source)) continue;
    const field = templateContentSchema.shape[key].safeParse(source[key]);
    if (field.success) content[key] = field.data;
  }
  return content as TemplateContent;
}

/** Remplace `{{variable}}` ; une variable inconnue ou vide disparaît, sans laisser d'accolades. */
export function interpolate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (_, key: string) => vars[key.toLowerCase()] ?? "");
}

/** Valeurs d'exemple d'un modèle, pour l'aperçu. */
export function exampleVars(variables: readonly TemplateVariable[], restaurant: string) {
  return Object.fromEntries(
    variables.map((variable) => [variable.key, variable.key === "etablissement" ? restaurant : variable.example]),
  );
}
