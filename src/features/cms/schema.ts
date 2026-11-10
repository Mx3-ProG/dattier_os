import { z } from "zod";
import { isSafeHref } from "./text";

/** Bump when the shape changes; add a migration step in `upgrade()` (service.ts). */
export const SCHEMA_VERSION = 1;

const text = (max: number) => z.string().max(max);
/** Media references: built-in public assets or files uploaded through the CMS. */
export const MEDIA_REF =
  /^(\/cms\/[a-z0-9/_.-]+\.(jpe?g|png|svg|webp)|\/api\/cms\/[a-zA-Z0-9_-]+\/media\/[a-f0-9-]{36}\.(webp|jpg|png|mp4|webm))$/;
export const mediaRef = z
  .string()
  .regex(
    MEDIA_REF,
    "Média invalide : choisissez un fichier de la médiathèque.",
  );
const optionalMedia = z.union([mediaRef, z.literal("")]);
export const imageSchema = z.object({ src: mediaRef, alt: text(200) });
const optionalImage = z.object({ src: optionalMedia, alt: text(200) });
export const linkSchema = z.object({
  label: text(80),
  href: z
    .string()
    .max(500)
    .refine((v) => v === "" || isSafeHref(v), "Lien non autorisé."),
});
const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB attendue.");

export const fontIds = [
  "georgia",
  "arial",
  "system",
  "trebuchet",
  "playfair",
  "fraunces",
  "dmSerif",
  "poppins",
  "nunito",
  "inter",
] as const;
export type FontId = (typeof fontIds)[number];

export const presentationSchema = z.object({
  layout: z.enum([
    "bistrot",
    "jardin",
    "comptoir",
    "pause",
    "signature",
    "riviera",
    "atelier",
    "escale",
  ]),
  stickyHeader: z.boolean(),
  stickyAction: z.enum(["none", "order", "reserve"]),
  motion: z.boolean(),
  surprise: z.boolean(),
});
export type Presentation = z.infer<typeof presentationSchema>;

export const themeSchema = z.object({
  // Optional for existing published sites: no migration or visual change required.
  presentation: presentationSchema.optional(),
  colors: z.object({
    primary: hex,
    primaryDark: hex,
    secondary: hex,
    accent: hex,
    text: hex,
    muted: hex,
    background: hex,
    buttonBg: hex,
    buttonText: hex,
    link: hex,
  }),
  fonts: z.object({
    heading: z.enum(fontIds),
    body: z.enum(fontIds),
    button: z.enum(fontIds),
  }),
  headingScale: z.number().min(0.7).max(1.3),
  subheadingScale: z.number().min(0.7).max(1.3),
  headingWeight: z.union([
    z.literal(600),
    z.literal(700),
    z.literal(800),
    z.literal(900),
  ]),
  letterSpacing: z.enum(["tight", "normal", "wide"]),
});
export type Theme = z.infer<typeof themeSchema>;

/* ───────────────────────── Sections ───────────────────────── */

const badge = z.object({
  icon: z.enum(["bag", "clock", "card", "wallet", "star", "pin", "sparkles"]),
  label: text(60),
});
export const sectionProps = {
  hero: z.object({
    kicker: text(80),
    title: text(160),
    lead: text(400),
    primary: linkSchema,
    secondary: linkSchema,
    badges: z.array(badge).max(6),
    image: imageSchema,
    sticker: z.boolean(),
    floatingText: text(60),
  }),
  marquee: z.object({ items: z.array(text(60)).min(1).max(10) }),
  featuredProducts: z.object({
    kicker: text(80),
    title: text(160),
    aside: text(300),
    note: text(160),
    limit: z.number().int().min(0).max(100),
    allLink: linkSchema,
  }),
  about: z.object({
    image: imageSchema,
    artCaption: text(60),
    kicker: text(80),
    title: text(200),
    paragraphs: z.array(text(1000)).max(6),
    cta: linkSchema,
  }),
  visit: z.object({
    kicker: text(80),
    title: text(160),
    hoursTitle: text(120),
    hoursNote: text(160),
    cta: linkSchema,
    burger: z.boolean(),
    burgerOpen: text(60),
    burgerClosed: text(60),
    burgerHint: text(120),
  }),
  reviews: z.object({
    kicker: text(80),
    title: text(160),
    text: text(600),
    rateLabel: text(60),
    viewLabel: text(60),
    sheetLabel: text(60),
    cardCaption: text(80),
  }),
  map: z.object({ kicker: text(80), title: text(160), buttonLabel: text(60) }),
  gallery: z.object({
    kicker: text(80),
    title: text(160),
    intro: text(600),
    pageTitle: z.boolean(),
    images: z.array(imageSchema).max(24),
  }),
  textBlock: z.object({
    kicker: text(80),
    title: text(160),
    body: text(4000),
    align: z.enum(["left", "center"]),
  }),
  textImage: z.object({
    kicker: text(80),
    title: text(160),
    body: text(3000),
    image: imageSchema,
    imageSide: z.enum(["left", "right"]),
    cta: linkSchema,
  }),
  video: z.object({
    kicker: text(80),
    title: text(160),
    caption: text(300),
    source: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("file"),
        src: z.union([
          z
            .string()
            .regex(
              /^\/api\/cms\/[a-zA-Z0-9_-]+\/media\/[a-f0-9-]{36}\.(mp4|webm)$/,
            ),
          z.literal(""),
        ]),
        poster: optionalMedia,
      }),
      z.object({
        kind: z.enum(["youtube", "vimeo"]),
        id: z
          .string()
          .regex(/^[A-Za-z0-9_-]{6,20}$/, "Identifiant vidéo invalide."),
        poster: optionalMedia,
      }),
    ]),
  }),
  faq: z.object({
    kicker: text(80),
    title: text(160),
    items: z
      .array(z.object({ question: text(200), answer: text(2000) }))
      .max(20),
  }),
  cta: z.object({
    title: text(160),
    text: text(400),
    link: linkSchema,
    tone: z.enum(["pink", "dark", "light"]),
  }),
  promoBanner: z.object({ text: text(200), link: linkSchema }),
  categories: z.object({ kicker: text(80), title: text(160) }),
  hours: z.object({ title: text(120), note: text(160) }),
  /* Sections d’add-ons : affichées seulement si l’add-on est installé. */
  estimation: z.object({ kicker: text(80), title: text(160), lead: text(400), buttonLabel: text(60) }),
  loyalty: z.object({ kicker: text(80), title: text(160), lead: text(400), perks: z.array(text(120)).max(6), buttonLabel: text(60) }),
  reservation: z.object({ kicker: text(80), title: text(160), lead: text(400), buttonLabel: text(60) }),
  allergens: z.object({ kicker: text(80), title: text(160), lead: text(400) }),
  delivery: z.object({ kicker: text(80), title: text(160), lead: text(400), checker: z.boolean() }),
  bundles: z.object({ kicker: text(80), title: text(160), lead: text(400) }),
  services: z.object({ kicker: text(80), title: text(160), lead: text(400), buttonLabel: text(60), buttonLink: text(300) }),
  /* Services et Produits créés dans Gestion : seuls ceux marqués « Sur le site » apparaissent. */
  offerServices: z.object({ kicker: text(80), title: text(160), lead: text(400), category: text(80), limit: z.number().int().min(0).max(100), buttonLabel: text(60), buttonLink: text(300) }),
  offerProducts: z.object({ kicker: text(80), title: text(160), lead: text(400), category: text(80), limit: z.number().int().min(0).max(100), buttonLabel: text(60), buttonLink: text(300) }),
  /** Additional text on a legal page. The mandatory legal text stays in code. */
  legal: z.object({ extra: z.array(text(2000)).max(10) }),
  /** Functional blocks rendered by existing code. Never editable from the CMS. */
  system: z.object({
    block: z.enum([
      "orderStart",
      "tracking",
      "account",
      "reviewForm",
      "reservationForm",
    ]),
  }),
} as const;
export type SectionType = keyof typeof sectionProps;
export const sectionTypes = Object.keys(sectionProps) as SectionType[];

const sectionBase = {
  id: z.string().regex(/^[a-z0-9-]{3,48}$/, "Identifiant de section invalide."),
  lock: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  visible: z.boolean(),
  /** Required sections cannot be deleted (but may be hidden if lock allows). */
  required: z.boolean(),
};
export const sectionSchema = z.discriminatedUnion(
  "type",
  sectionTypes.map((type) =>
    z.object({
      ...sectionBase,
      type: z.literal(type),
      props: sectionProps[type],
    }),
  ) as unknown as [
    z.ZodObject<
      typeof sectionBase & {
        type: z.ZodLiteral<"hero">;
        props: (typeof sectionProps)["hero"];
      }
    >,
  ],
);
export type Section = {
  [T in SectionType]: {
    id: string;
    type: T;
    lock: 1 | 2 | 3;
    visible: boolean;
    required: boolean;
    props: z.infer<(typeof sectionProps)[T]>;
  };
}[SectionType];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;

export const pageKinds = [
  "content",
  "partial",
  "protected",
  "legal",
  "custom",
] as const;
export const seoSchema = z.object({
  noIndex: z.boolean().optional(),
  title: text(70),
  description: text(170),
  ogImage: optionalMedia,
});
export const pageSchema = z.object({
  kind: z.enum(pageKinds),
  title: text(80).min(1, "Titre requis."),
  slug: z.string().max(60),
  visible: z.boolean(),
  seo: seoSchema,
  sections: z.array(sectionSchema as unknown as z.ZodType<Section>).max(40),
});
export type Page = z.infer<typeof pageSchema>;

export const legalIdentitySchema = z.object({
  operator: text(200),
  legalForm: text(120),
  siret: text(40),
  rcs: text(120),
  vat: text(40),
  email: text(150),
  publicationDirector: text(150),
  host: text(300),
  mediator: text(300),
});

/* ───────────────────────── SEO identity ───────────────────────── */

export const localeSchema = z.object({
  language: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "Langue au format « fr » ou « en-GB »."),
  country: z.union([
    z.string().regex(/^[A-Z]{2}$/, "Pays au format « FR »."),
    z.literal(""),
  ]),
});
/** Site-relative path: /ancienne-page (no query, no protocol-relative URL). */
const sitePath = z
  .string()
  .max(200)
  .regex(/^\/(?!\/)[A-Za-z0-9._~\-/%]*$/, "Chemin au format /ancienne-page.");
export const redirectSchema = z
  .object({
    from: sitePath.refine(
      (p) => p !== "/",
      "L’accueil ne peut pas être redirigé.",
    ),
    to: z.union([
      sitePath,
      z
        .string()
        .max(500)
        .regex(/^https:\/\/[^\s]+$/, "Adresse https attendue."),
    ]),
    permanent: z.boolean(),
  })
  .refine(
    (r) => r.from !== r.to,
    "Une redirection ne peut pas pointer vers elle-même.",
  );
export const businessTypes = [
  "Restaurant",
  "FastFoodRestaurant",
  "CafeOrCoffeeShop",
  "Bakery",
  "BarOrPub",
  "IceCreamShop",
  "FoodEstablishment",
  "Store",
  "LocalBusiness",
  /** No premises open to the public (online only): no address or hours published. */
  "Organization",
] as const;
export const businessSchema = z.object({
  type: z.enum(businessTypes),
  cuisines: z.array(text(60)).max(8),
  priceRange: text(10),
  /** Official profiles (social networks, directories) owned by the business. */
  sameAs: z
    .array(
      z
        .string()
        .max(300)
        .regex(/^https:\/\/[^\s]+$/, "Adresse https attendue."),
    )
    .max(10),
  areaServed: z.array(text(80)).max(10),
  geo: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable(),
});
export type Business = z.infer<typeof businessSchema>;

export const siteConfigSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  branding: z.object({
    publicName: text(80),
    brandLines: text(80),
    logo: imageSchema,
    description: text(300),
    email: text(150),
    announcement: text(120),
    announcementHighlight: text(60),
    /** Écran de chargement du site public (add-on acquis), absent = aucun. */
    loader: z.object({ product: z.string().max(64).nullable() }).optional(),
    /** Décoration visuelle du site public (add-on acquis), absente par défaut. */
    decoration: z.object({ product: z.string().max(64).nullable() }).optional(),
    /** Fond de page acquis pour cet établissement, absent = thème normal. */
    background: z.object({ product: z.string().max(64).nullable() }).optional(),
    /** Page 404 du site : modèle (add-on acquis) et textes. Absent = modèle par défaut. */
    notFound: z
      .object({ product: z.string().max(64).nullable(), title: text(120), message: text(400), button: text(60) })
      .optional(),
  }),
  theme: themeSchema,
  seo: z.object({
    noIndex: z.boolean().optional(),
    title: text(70).min(1),
    description: text(170),
    ogImage: optionalMedia,
    favicon: optionalMedia,
    shareName: text(80),
    /** robots.txt preferences for identified AI crawlers (absent = allowed). */
    aiCrawlers: z
      .object({ search: z.boolean(), training: z.boolean() })
      .optional(),
    /** Site language (BCP 47) and main country (ISO 3166). Absent = fr / FR. */
    locale: localeSchema.optional(),
    /** Publish /llms.txt (optional summary for AI tools; absent = not published). */
    llmsTxt: z.boolean().optional(),
    /** Redirects of former addresses (after a page is renamed or removed). */
    redirects: z.array(redirectSchema).max(100).optional(),
  }),
  /** Business identity used for structured data. Every field is optional. */
  business: businessSchema.optional(),
  header: z.object({
    navMenu: text(40),
    navUniverse: text(40),
    navContact: text(40),
    navAccount: text(40),
    orderLabel: text(40),
  }),
  footer: z.object({
    tagline: text(160),
    cta: text(60),
    credit: text(120),
    notice: text(400),
  }),
  legal: legalIdentitySchema,
  pages: z.record(z.string().regex(/^[a-z0-9-]{2,60}$/), pageSchema),
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;
export { optionalImage };
