/* FLUX : le plan de site qu’écrit l’IA (ou le moteur réflexe) à partir d’une
   seule demande. Pur : partagé par le serveur, les tests et l’interface.
   Le plan est petit et lisible ; c’est le serveur qui le transforme en
   configuration du site (build.ts), jamais le navigateur. */
import { fontIds, type FontId } from "@/features/cms/schema";
import type { AddonSectionType } from "@/features/cms/site-addons";

/** Modèles gratuits : FLUX n’utilise jamais un modèle premium non acquis. */
export const fluxLayouts = ["bistrot", "jardin", "comptoir", "pause"] as const;
export type FluxLayout = (typeof fluxLayouts)[number];

/** Ce que met en avant le bouton principal du site. */
export const fluxGoals = ["order", "reserve", "contact"] as const;
export type FluxGoal = (typeof fluxGoals)[number];

export const fluxAddonSections = [
  "reservation",
  "loyalty",
  "delivery",
  "bundles",
  "allergens",
  "services",
  "estimation",
] as const satisfies readonly AddonSectionType[];

export type FluxPlan = {
  layout: FluxLayout;
  goal: FluxGoal;
  name: string;
  description: string;
  announcement: string;
  colors: { primary: string; background: string; accent: string };
  fonts: { heading: FontId; body: FontId };
  hero: {
    kicker: string;
    title: string;
    lead: string;
    primaryLabel: string;
    secondaryLabel: string;
    badges: string[];
  };
  marquee: string[];
  products: { kicker: string; title: string; aside: string };
  about: { kicker: string; title: string; paragraphs: string[] };
  faq: { question: string; answer: string }[];
  cta: { title: string; text: string; label: string };
  footer: { tagline: string; cta: string };
  seo: { title: string; description: string };
  /** Sections d’add-ons souhaitées : posées seulement si l’add-on est installé. */
  addonSections: (typeof fluxAddonSections)[number][];
  /** Produits de la boutique d’add-ons à appliquer s’ils sont déjà acquis. */
  extras: {
    loader: string | null;
    notFound: string | null;
    background: string | null;
    decoration: string | null;
  };
};

/** Add-on proposé à l’utilisateur pour aller plus loin. */
export type FluxSuggestion = {
  id: string;
  name: string;
  reason: string;
  priceCents: number;
  pricing: "free" | "one_time" | "subscription";
  owned: boolean;
};

/** Résumé lisible du plan, affiché dans la carte de confirmation. */
export function describePlan(plan: FluxPlan, addonSections = 0): string[] {
  const layout = {
    bistrot: "Bistrot (chaleureux)",
    jardin: "Jardin (lumineux, naturel)",
    comptoir: "Comptoir (vente directe)",
    pause: "Pause (doux, gourmand)",
  }[plan.layout];
  const goal = {
    order: "commander en ligne",
    reserve: "réserver",
    contact: "vous contacter",
  }[plan.goal];
  return [
    `Mise en page : ${layout}`,
    `Bouton principal : ${goal}`,
    `Titre : ${plan.hero.title.replace(/\*/g, "").replace(/\n/g, " ")}`,
    `Bandeau : ${plan.announcement}`,
    `Sections : bannière, défilant, produits, histoire${plan.faq.length ? ", questions fréquentes" : ""}, appel à l’action${addonSections ? `, ${addonSections} module${addonSections > 1 ? "s" : ""} d’add-on` : ""}`,
  ];
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const clip = (value: unknown, max: number) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, "")
    .trim()
    .slice(0, max);
const list = (value: unknown, max: number, size: number) =>
  (Array.isArray(value) ? value : [])
    .map((v) => clip(v, size))
    .filter(Boolean)
    .slice(0, max);
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const hex = (value: unknown, fallback: string) => {
  const v = clip(value, 7);
  return HEX.test(v) ? v.toLowerCase() : fallback;
};
const product = (value: unknown) => {
  const v = clip(value, 64);
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(v) ? v : null;
};

/** Nettoie un plan venu du modèle : longueurs bornées, valeurs connues, jamais d’erreur. */
export function normalizePlan(raw: unknown, fallback: FluxPlan): FluxPlan {
  type Loose = { [key: string]: Loose } & Record<string, unknown>;
  const r = (raw && typeof raw === "object" ? raw : {}) as Loose;
  const or = (value: string, alt: string) => value || alt;
  const hero = r.hero ?? {};
  const products = r.products ?? {};
  const about = r.about ?? {};
  const cta = r.cta ?? {};
  const footer = r.footer ?? {};
  const seo = r.seo ?? {};
  const extras = r.extras ?? {};
  const marquee = list(r.marquee, 6, 60);
  const paragraphs = list(about.paragraphs, 3, 1000);
  return {
    layout: pick(r.layout, fluxLayouts, fallback.layout),
    goal: pick(r.goal, fluxGoals, fallback.goal),
    name: clip(r.name, 80),
    description: or(clip(r.description, 300), fallback.description),
    announcement: or(clip(r.announcement, 120), fallback.announcement),
    colors: {
      primary: hex(r.colors?.primary, fallback.colors.primary),
      background: hex(r.colors?.background, fallback.colors.background),
      accent: hex(r.colors?.accent, fallback.colors.accent),
    },
    fonts: {
      heading: pick(r.fonts?.heading, fontIds, fallback.fonts.heading),
      body: pick(r.fonts?.body, fontIds, fallback.fonts.body),
    },
    hero: {
      kicker: or(clip(hero.kicker, 80), fallback.hero.kicker),
      title: or(clip(hero.title, 160), fallback.hero.title),
      lead: or(clip(hero.lead, 400), fallback.hero.lead),
      primaryLabel: or(clip(hero.primaryLabel, 40), fallback.hero.primaryLabel),
      secondaryLabel: or(clip(hero.secondaryLabel, 40), fallback.hero.secondaryLabel),
      badges: list(hero.badges, 4, 60).length ? list(hero.badges, 4, 60) : fallback.hero.badges,
    },
    marquee: marquee.length ? marquee : fallback.marquee,
    products: {
      kicker: or(clip(products.kicker, 80), fallback.products.kicker),
      title: or(clip(products.title, 160), fallback.products.title),
      aside: or(clip(products.aside, 300), fallback.products.aside),
    },
    about: {
      kicker: or(clip(about.kicker, 80), fallback.about.kicker),
      title: or(clip(about.title, 200), fallback.about.title),
      paragraphs: paragraphs.length ? paragraphs : fallback.about.paragraphs,
    },
    faq: (Array.isArray(r.faq) ? r.faq : [])
      .map((f: { question?: unknown; answer?: unknown } | null) => ({ question: clip(f?.question, 200), answer: clip(f?.answer, 2000) }))
      .filter((f: { question: string; answer: string }) => f.question && f.answer)
      .slice(0, 6),
    cta: {
      title: or(clip(cta.title, 160), fallback.cta.title),
      text: or(clip(cta.text, 400), fallback.cta.text),
      label: or(clip(cta.label, 60), fallback.cta.label),
    },
    footer: {
      tagline: or(clip(footer.tagline, 160), fallback.footer.tagline),
      cta: or(clip(footer.cta, 60), fallback.footer.cta),
    },
    seo: {
      title: or(clip(seo.title, 70), fallback.seo.title),
      description: or(clip(seo.description, 170), fallback.seo.description),
    },
    addonSections: [
      ...new Set(
        (Array.isArray(r.addonSections) ? r.addonSections : []).filter((t: unknown) =>
          fluxAddonSections.includes(t as (typeof fluxAddonSections)[number]),
        ),
      ),
    ] as FluxPlan["addonSections"],
    extras: {
      loader: product(extras.loader),
      notFound: product(extras.notFound),
      background: product(extras.background),
      decoration: product(extras.decoration),
    },
  };
}
