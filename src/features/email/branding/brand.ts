import { z } from "zod";

/**
 * Identité visuelle des emails, propre à chaque établissement (table `email_brands`).
 * Module pur : partagé par le serveur (rendu à l'envoi) et l'écran (aperçu en direct).
 * Ne dépend ni du moteur d'envoi ni de la configuration SMTP.
 */
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB.")
  .transform((value) => value.toLowerCase());
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https:\/\/[^\s"'<>]+$/.test(value), "Adresse https:// requise.");

export const emailFonts = {
  system: { label: "Sans empattement", stack: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" },
  humanist: { label: "Humaniste", stack: "'Trebuchet MS','Gill Sans','Helvetica Neue',Arial,sans-serif" },
  serif: { label: "Classique à empattement", stack: "Georgia,'Times New Roman',Times,serif" },
  elegant: { label: "Élégante", stack: "'Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif" },
  mono: { label: "Machine à écrire", stack: "'Courier New',Courier,monospace" },
} as const;
export type EmailFont = keyof typeof emailFonts;

export const brandSchema = z
  .object({
    /** Nom affiché comme expéditeur et en-tête. Vide : nom de l'établissement. */
    senderName: z.string().trim().max(80).default(""),
    /** Adresse de réponse des clients (Reply-To). */
    replyTo: z.union([z.literal(""), z.email().max(254)]).default(""),
    logoUrl: httpsUrl.default(""),
    logoWidth: z.number().int().min(60).max(320).default(140),
    primary: color.default("#344d3e"),
    accent: color.default("#c8894b"),
    background: color.default("#f4f1ea"),
    surface: color.default("#ffffff"),
    text: color.default("#1f2a24"),
    muted: color.default("#6b7570"),
    buttonText: color.default("#ffffff"),
    font: z.enum(Object.keys(emailFonts) as [EmailFont, ...EmailFont[]]).default("system"),
    headingFont: z.enum(Object.keys(emailFonts) as [EmailFont, ...EmailFont[]]).default("serif"),
    radius: z.number().int().min(0).max(28).default(14),
    align: z.enum(["left", "center"]).default("left"),
    header: z.enum(["logo", "name", "band"]).default("band"),
    buttonStyle: z.enum(["filled", "outline", "pill"]).default("filled"),
    footer: z.string().trim().max(600).default(""),
    signature: z.string().trim().max(400).default(""),
    websiteUrl: httpsUrl.default(""),
  })
  .strict();
export type EmailBrand = z.infer<typeof brandSchema>;

export const defaultBrand: EmailBrand = brandSchema.parse({});

/** Lecture tolérante d'un document stocké : un champ invalide reprend sa valeur par défaut. */
export function readBrand(raw: unknown): EmailBrand {
  const parsed = brandSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const brand: Record<string, unknown> = { ...defaultBrand };
  for (const key of Object.keys(defaultBrand) as (keyof EmailBrand)[]) {
    if (!(key in source)) continue;
    const field = brandSchema.shape[key].safeParse(source[key]);
    if (field.success) brand[key] = field.data;
  }
  return brand as EmailBrand;
}

/** Palettes de départ : un clic, puis chaque nuance reste modifiable. */
export const brandPresets: { id: string; label: string; colors: Pick<EmailBrand, "primary" | "accent" | "background" | "surface" | "text" | "muted" | "buttonText"> }[] = [
  { id: "olive", label: "Olivier", colors: { primary: "#344d3e", accent: "#c8894b", background: "#f4f1ea", surface: "#ffffff", text: "#1f2a24", muted: "#6b7570", buttonText: "#ffffff" } },
  { id: "bordeaux", label: "Bordeaux", colors: { primary: "#6d1f2f", accent: "#d4a373", background: "#f8f0ec", surface: "#ffffff", text: "#2b1a1d", muted: "#7a6266", buttonText: "#ffffff" } },
  { id: "ocean", label: "Océan", colors: { primary: "#1d4e89", accent: "#2bb3b1", background: "#eef4fa", surface: "#ffffff", text: "#132235", muted: "#5e6f82", buttonText: "#ffffff" } },
  { id: "terracotta", label: "Terracotta", colors: { primary: "#b5523b", accent: "#e9c46a", background: "#fbf3ec", surface: "#ffffff", text: "#2e1f1a", muted: "#7d6a62", buttonText: "#ffffff" } },
  { id: "night", label: "Nuit", colors: { primary: "#e0b354", accent: "#7fb7a4", background: "#111614", surface: "#1b2320", text: "#eef2ef", muted: "#9aa7a1", buttonText: "#111614" } },
  { id: "minimal", label: "Minimal", colors: { primary: "#111111", accent: "#888888", background: "#ffffff", surface: "#ffffff", text: "#111111", muted: "#6b6b6b", buttonText: "#ffffff" } },
];
