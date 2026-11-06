import { defaultConfig, systemPageKeys } from "./defaults";
import { registry } from "./registry";
import type { Section, SectionType, SiteConfig, Theme } from "./schema";

/* ───────────────────────── Contrast (WCAG 2.x) ───────────────────────── */

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}
/** Pairs that must stay readable. Below `min` the server refuses; below 4.5 the editor warns. */
export function contrastChecks(theme: Theme) {
  const c = theme.colors;
  return [
    {
      id: "text",
      label: "Texte sur le fond",
      ratio: contrast(c.text, c.background),
      min: 4.5,
    },
    {
      id: "muted",
      label: "Texte secondaire sur le fond",
      ratio: contrast(c.muted, c.background),
      min: 3,
    },
    {
      id: "button",
      label: "Texte des boutons",
      ratio: contrast(c.buttonText, c.buttonBg),
      min: 3,
    },
    {
      id: "primary",
      label: "Mots mis en avant sur le fond",
      ratio: contrast(c.primary, c.background),
      min: 3,
    },
    {
      id: "link",
      label: "Liens sur le fond",
      ratio: contrast(c.link, c.background),
      min: 3,
    },
  ];
}

/* ───────────────────────── Slugs ───────────────────────── */

/** Routes owned by the application: a custom page can never take them. */
export const reservedSlugs = new Set([
  ...systemPageKeys,
  "api",
  "dashboard",
  "demo",
  "avantage",
  "admin",
  "p",
  "_next",
  "static",
  "public",
  "donuts",
  "icon",
  "icon.jpg",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "login",
  "logout",
  "panier",
  "produits",
  "paiement",
  "commande",
  "connexion",
  "inscription",
]);
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function slugError(
  slug: string,
  config: SiteConfig,
  ignoreKey?: string,
) {
  if (slug.length < 2 || slug.length > 60)
    return "L’adresse doit compter de 2 à 60 caractères.";
  if (!SLUG.test(slug))
    return "Utilisez des minuscules, des chiffres et des tirets, sans accent.";
  if (reservedSlugs.has(slug)) return "Cette adresse est réservée par le site.";
  if (
    Object.keys(config.pages).some(
      (k) => k !== ignoreKey && (k === slug || config.pages[k].slug === slug),
    )
  )
    return "Une page utilise déjà cette adresse.";
  return null;
}

/* ───────────────────────── Locks ───────────────────────── */

export type Role = "OWNER" | "SUPER_ADMIN";
export type CmsSettings = { keepVersions: number; allowedTypes: SectionType[] };
export const defaultCmsSettings = (): CmsSettings => ({
  keepVersions: 30,
  allowedTypes: (Object.keys(registry) as SectionType[]).filter(
    (t) => registry[t].addable,
  ),
});

/** Key-order independent equality (validated objects come back with schema key order). */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const fail = (message: string): never => {
  throw new Error(`Modification refusée : ${message}`);
};

/** Invariants that hold for every role, on every save, publish and restore. */
export function checkInvariants(config: SiteConfig) {
  const reference = defaultConfig();
  for (const key of systemPageKeys) {
    const page = config.pages[key];
    if (!page)
      fail(`la page « ${reference.pages[key].title} » est obligatoire.`);
    if (page.kind !== reference.pages[key].kind)
      fail("le type d’une page système ne peut pas changer.");
    for (const required of reference.pages[key].sections.filter(
      (s) => s.lock === 3,
    ))
      if (!page.sections.some((s) => s.id === required.id && same(s, required)))
        fail(`le bloc protégé « ${required.id} » doit rester intact.`);
    // Protected and legal pages keep exactly their built-in blocks.
    if (["protected", "legal"].includes(page.kind)) {
      const ids = (list: Section[]) =>
        list.map((s) => `${s.id}:${s.type}`).join("|");
      if (ids(page.sections) !== ids(reference.pages[key].sections))
        fail(
          `la structure de la page « ${reference.pages[key].title} » est protégée.`,
        );
      if (page.sections.some((s) => !s.visible) || !page.visible)
        fail("une page protégée ou légale ne peut pas être masquée.");
    }
  }
  for (const [key, page] of Object.entries(config.pages)) {
    if (systemPageKeys.includes(key)) {
      if (page.slug !== reference.pages[key].slug)
        fail("l’adresse d’une page système ne peut pas changer.");
      continue;
    }
    if (page.kind !== "custom")
      fail("seules les pages créées peuvent être ajoutées.");
    if (page.slug !== key) fail("l’adresse de la page est incohérente.");
    const error = slugError(key, config, key);
    if (error) fail(error);
    if (page.sections.some((s) => s.type === "system" || s.type === "legal"))
      fail("une page créée ne peut pas contenir de bloc protégé.");
  }
  const ids = Object.values(config.pages).flatMap((p) =>
    p.sections.map((s) => s.id),
  );
  if (new Set(ids).size !== ids.length)
    fail("deux sections portent le même identifiant.");
  for (const check of contrastChecks(config.theme))
    if (check.ratio < 3)
      fail(
        `contraste insuffisant (${check.label} : ${check.ratio}:1, minimum 3:1).`,
      );
}

/**
 * What an administrator (OWNER) may change between two configurations.
 * SUPER_ADMIN is only bound by the invariants.
 */
export function enforceLocks(
  prev: SiteConfig,
  next: SiteConfig,
  role: Role,
  settings: CmsSettings,
) {
  checkInvariants(next);
  if (role === "SUPER_ADMIN") return;
  for (const [key, before] of Object.entries(prev.pages)) {
    const after = next.pages[key];
    if (!after) {
      if (before.kind !== "custom")
        fail("une page système ne peut pas être supprimée.");
      continue;
    }
    const kept = after.sections.filter((s) =>
      before.sections.some((b) => b.id === s.id),
    );
    for (const old of before.sections) {
      const now = after.sections.find((s) => s.id === old.id);
      if (!now) {
        if (old.required || old.lock >= 2)
          fail(`la section « ${old.id} » ne peut pas être supprimée.`);
        continue;
      }
      if (
        now.type !== old.type ||
        now.lock !== old.lock ||
        now.required !== old.required
      )
        fail(
          "le type ou le verrouillage d’une section est réservé au super-administrateur.",
        );
      if (old.lock === 3 && !same(now, old))
        fail(`la section « ${old.id} » est protégée.`);
      if (old.lock === 2) {
        const allowed = new Set(
          old.type === "system" ? [] : registry[old.type].partialFields,
        );
        for (const field of Object.keys(old.props))
          if (
            !allowed.has(field) &&
            !same(
              (old.props as Record<string, unknown>)[field],
              (now.props as Record<string, unknown>)[field],
            )
          )
            fail(`le champ « ${field} » de cette section est verrouillé.`);
        if (old.visible !== now.visible && old.required)
          fail("une section obligatoire ne peut pas être masquée.");
      }
    }
    // Order is free only on content and custom pages (which hold no protected block).
    const order = (list: Section[]) => list.map((s) => s.id).join("|");
    const beforeKept = before.sections.filter((s) =>
      kept.some((k) => k.id === s.id),
    );
    if (
      !["content", "custom"].includes(before.kind) &&
      order(kept) !== order(beforeKept)
    )
      fail("l’ordre des sections de cette page est verrouillé.");
    for (const added of after.sections.filter(
      (s) => !before.sections.some((b) => b.id === s.id),
    )) {
      if (!["content", "custom"].includes(before.kind))
        fail("aucune section ne peut être ajoutée sur cette page.");
      if (added.lock !== 1 || added.required)
        fail("une nouvelle section est toujours librement modifiable.");
      if (
        !settings.allowedTypes.includes(added.type) ||
        !registry[added.type].addable
      )
        fail(`le composant « ${added.type} » n’est pas autorisé.`);
    }
    if (before.kind !== "custom" && after.visible !== before.visible)
      fail("une page système ne peut pas être masquée.");
  }
  for (const [key, page] of Object.entries(next.pages))
    if (!prev.pages[key])
      for (const s of page.sections)
        if (
          s.lock !== 1 ||
          s.required ||
          !settings.allowedTypes.includes(s.type)
        )
          fail(
            "une page créée ne contient que des sections libres et autorisées.",
          );
}
