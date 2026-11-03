import { rows, type DB } from "@/lib/database/db";
import type { SiteConfig, FontId } from "@/features/cms/schema";
import type { Product, Settings } from "@/features/commerce/schema";
import type { PlaceholderContext } from "@/features/cms/text";
import { website } from "@/features/cms/service";
import { commerce } from "@/features/commerce/service";
import { indexablePages, publicPages } from "./sitemap";
import { effectiveTitle } from "./meta";
import { siteUrls } from "./urls";
import { seoFacts, platformUrl } from "./server";
import { llmsEnabled } from "./llms";

/**
 * Technical SEO/GEO health of a published site. Every check states a fact
 * computed from the site's own data; there is deliberately no score and no
 * estimate of rankings or AI citations.
 */
export type CheckStatus = "ok" | "info" | "warning" | "error";
export type CheckArea =
  "configuration" | "technique" | "donnees" | "geo" | "performance";
export type Check = {
  id: string;
  area: CheckArea;
  status: CheckStatus;
  title: string;
  detail: string;
  fix?: string;
  priority?: "haute" | "moyenne" | "basse";
};
export type AuditReport = {
  version: 1;
  checkedAt: string;
  publishedAt: string | null;
  canonicalBase: string;
  indexable: boolean;
  stats: {
    indexablePages: number;
    products: number;
    redirects: number;
  };
  counts: Record<CheckStatus, number>;
  checks: Check[];
};
export type AuditInput = {
  restaurant: string;
  config: SiteConfig;
  context: PlaceholderContext;
  settings: Settings | null;
  products: Product[];
  primaryHost: string | null;
  domains: { hostname: string; verified: boolean }[];
  publishedAt: string | null;
  platformUrl: string;
  now?: Date;
};
/** Web fonts shipped with the platform and their WOFF2 weight (KB), for the performance note. */
const WEB_FONTS: Partial<Record<FontId, number>> = {
  playfair: 103,
  fraunces: 190,
  dmSerif: 31,
  poppins: 99,
  nunito: 98,
  inter: 342,
};
const list = (items: string[], max = 5) =>
  items.slice(0, max).join(", ") +
  (items.length > max ? `… (+${items.length - max})` : "");

export function auditSite(input: AuditInput): AuditReport {
  const { config, context } = input;
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const indexable = config.seo.noIndex === false;
  const keys = indexablePages(config);
  const urls = siteUrls({
    restaurant: input.restaurant,
    platformUrl: input.platformUrl,
    primaryHost: input.primaryHost,
    requestHost: input.primaryHost ?? new URL(input.platformUrl).hostname,
  });
  const physical = config.business?.type !== "Organization";
  const products = input.products.filter((p) => p.enabled);

  /* ── Configuration ── */
  add(
    input.publishedAt
      ? {
          id: "published",
          area: "configuration",
          status: "ok",
          title: "Site publié",
          detail: `Version en ligne publiée le ${input.publishedAt.slice(0, 10)}.`,
        }
      : {
          id: "published",
          area: "configuration",
          status: "error",
          priority: "haute",
          title: "Site jamais publié",
          detail:
            "Les visiteurs voient le contenu par défaut de la plateforme.",
          fix: "Publiez votre site depuis le Studio.",
        },
  );
  if (indexable)
    add({
      id: "indexing",
      area: "configuration",
      status: "ok",
      title: "Indexation activée",
      detail: `${keys.length} page(s) proposée(s) aux moteurs de recherche.`,
    });
  else {
    const missing = [
      !config.legal.operator && "exploitant",
      !config.legal.email && "e-mail de contact",
      !config.legal.host && "hébergeur",
    ].filter((x): x is string => !!x);
    add({
      id: "indexing",
      area: "configuration",
      status: "warning",
      priority: "haute",
      title: "Indexation désactivée",
      detail:
        "Le site demande aux moteurs de ne pas l’indexer : il n’apparaîtra pas dans les résultats.",
      fix: missing.length
        ? `Complétez les mentions légales (${missing.join(", ")}), puis activez l’indexation dans Studio › Référencement.`
        : "Activez l’indexation dans Studio › Référencement quand le site est prêt.",
    });
  }
  const pending = input.domains
    .filter((d) => !d.verified)
    .map((d) => d.hostname);
  if (pending.length)
    add({
      id: "domain-pending",
      area: "configuration",
      status: "warning",
      priority: "moyenne",
      title: "Domaine en attente de vérification",
      detail: list(pending),
      fix: "Ajoutez l’enregistrement DNS TXT indiqué, puis cliquez sur « Vérifier le DNS ».",
    });
  add(
    input.primaryHost
      ? {
          id: "domain",
          area: "configuration",
          status: "ok",
          title: "Domaine principal",
          detail: `Adresse officielle : https://${input.primaryHost}`,
        }
      : {
          id: "domain",
          area: "configuration",
          status: "info",
          title: "Adresse de la plateforme",
          detail: `Le site est servi sous ${urls.canonicalBase}.`,
          fix: "Un domaine à votre nom renforce l’identité du site ; vous pouvez l’ajouter dans l’onglet Domaines.",
        },
  );
  if (!config.seo.locale)
    add({
      id: "language",
      area: "configuration",
      status: "info",
      title: "Langue non déclarée",
      detail: "Le site est présenté comme français (France) par défaut.",
      fix: "Précisez la langue et le pays dans Studio › Référencement si besoin.",
    });

  /* ── Technical: titles, descriptions, sharing, redirects ── */
  // Titles and descriptions are checked on every public page, even before indexing is enabled.
  const pages = publicPages(config);
  const titles = new Map<string, string[]>();
  const longTitles: string[] = [];
  for (const key of pages) {
    const t = effectiveTitle(config, key, context);
    titles.set(t, [...(titles.get(t) ?? []), config.pages[key].title]);
    if (t.length > 60) longTitles.push(config.pages[key].title);
  }
  const dupTitles = [...titles.entries()].filter(([, p]) => p.length > 1);
  add(
    dupTitles.length
      ? {
          id: "titles-unique",
          area: "technique",
          status: "error",
          priority: "haute",
          title: "Titres de page en double",
          detail: dupTitles
            .map(([t, p]) => `« ${t} » : ${p.join(", ")}`)
            .join(" ; "),
          fix: "Donnez un titre propre à chaque page (Studio › Référencement).",
        }
      : {
          id: "titles-unique",
          area: "technique",
          status: "ok",
          title: "Titres de page uniques",
          detail: `${pages.length} page(s) publique(s), toutes avec un titre distinct.`,
        },
  );
  if (longTitles.length)
    add({
      id: "titles-length",
      area: "technique",
      status: "warning",
      priority: "basse",
      title: "Titres longs (plus de 60 caractères)",
      detail: list(longTitles),
      fix: "Raccourcissez-les : au-delà, les moteurs les tronquent souvent.",
    });
  const siteDescription = config.seo.description.trim();
  if (!siteDescription)
    add({
      id: "description",
      area: "technique",
      status: "error",
      priority: "haute",
      title: "Description du site absente",
      detail: "Les moteurs choisiront un extrait de page au hasard.",
      fix: "Rédigez une description de 50 à 160 caractères (Studio › Référencement).",
    });
  const sharedDescription = pages
    .filter((k) => !config.pages[k].seo.description)
    .map((k) => config.pages[k].title);
  if (siteDescription && sharedDescription.length > 1)
    add({
      id: "descriptions-unique",
      area: "technique",
      status: "warning",
      priority: "basse",
      title: "Descriptions partagées",
      detail: `${sharedDescription.length} pages reprennent la description du site : ${list(sharedDescription)}.`,
      fix: "Une description propre aux pages importantes (carte, contact) améliore l’extrait affiché.",
    });
  const shareImage = config.seo.ogImage || config.branding.logo.src;
  if (!config.seo.ogImage && /\.svg$/i.test(shareImage))
    add({
      id: "share-image",
      area: "technique",
      status: "warning",
      priority: "moyenne",
      title: "Pas d’image de partage adaptée",
      detail:
        "Le logo SVG est utilisé ; la plupart des réseaux sociaux n’affichent pas les images SVG.",
      fix: "Ajoutez une image de partage JPG ou PNG (1200 × 630 px conseillé).",
    });
  const redirects = config.seo.redirects ?? [];
  const brokenRedirects = redirects.filter((r) => {
    if (!r.to.startsWith("/")) return false;
    const key = r.to.replace(/^\/+|\/+$/g, "") || "home";
    return !config.pages[key] || !config.pages[key].visible;
  });
  if (brokenRedirects.length)
    add({
      id: "redirects-target",
      area: "technique",
      status: "warning",
      priority: "moyenne",
      title: "Redirections vers une page absente",
      detail: brokenRedirects.map((r) => `${r.from} → ${r.to}`).join(", "),
      fix: "Corrigez la destination ou retirez la redirection.",
    });
  const shadowed = redirects.filter(
    (r) => config.pages[r.from.replace(/^\/+|\/+$/g, "")],
  );
  if (shadowed.length)
    add({
      id: "redirects-shadowed",
      area: "technique",
      status: "info",
      title: "Redirections inactives",
      detail: `Ces adresses existent encore comme pages, la redirection ne s’applique pas : ${shadowed.map((r) => r.from).join(", ")}.`,
    });

  /* ── Structured data ── */
  if (physical) {
    const missing = [
      !context.address && "adresse",
      !context.phone && "téléphone",
      !input.settings?.hours.length && "horaires",
    ].filter((x): x is string => !!x);
    add(
      missing.length
        ? {
            id: "business-info",
            area: "donnees",
            status: "warning",
            priority: "haute",
            title: "Informations pratiques incomplètes",
            detail: `Manquant : ${missing.join(", ")}. Ces informations sont essentielles pour un établissement recevant du public.`,
            fix: "Renseignez-les dans Boutique › Paramètres.",
          }
        : {
            id: "business-info",
            area: "donnees",
            status: "ok",
            title: "Adresse, téléphone et horaires publiés",
            detail: "Repris dans les données structurées de l’établissement.",
          },
    );
  }
  if (!config.business)
    add({
      id: "business-type",
      area: "donnees",
      status: "info",
      title: "Type d’activité par défaut",
      detail: "L’établissement est décrit comme « Restaurant ».",
      fix: "Précisez le type, les cuisines et la gamme de prix dans Studio › Référencement.",
    });
  const menuVisible = keys.includes("carte");
  if (menuVisible && !products.length)
    add({
      id: "menu-empty",
      area: "donnees",
      status: "warning",
      priority: "moyenne",
      title: "Carte vide",
      detail: "La page carte est publiée sans aucun produit actif.",
    });
  const noDesc = products
    .filter((p) => !p.description.trim())
    .map((p) => p.name);
  if (noDesc.length)
    add({
      id: "menu-descriptions",
      area: "donnees",
      status: "info",
      title: "Produits sans description",
      detail: `${noDesc.length}/${products.length} : ${list(noDesc)}.`,
      fix: "Une courte description factuelle (ingrédients, préparation) aide les visiteurs et les assistants IA.",
    });
  if (products.length && !noDesc.length)
    add({
      id: "menu-descriptions",
      area: "donnees",
      status: "ok",
      title: "Carte décrite",
      detail: `${products.length} produit(s) avec description et prix.`,
    });
  const emptyFaq = Object.values(config.pages).flatMap((p) =>
    p.sections.flatMap((s) =>
      s.visible && s.type === "faq"
        ? s.props.items
            .filter((i) => i.question.trim() && !i.answer.trim())
            .map((i) => i.question)
        : [],
    ),
  );
  if (emptyFaq.length)
    add({
      id: "faq-empty",
      area: "donnees",
      status: "warning",
      priority: "basse",
      title: "Questions sans réponse",
      detail: list(emptyFaq),
      fix: "Répondez-y ou retirez-les : elles sont ignorées dans les données structurées.",
    });

  /* ── GEO ── */
  const description = context.description || config.branding.description;
  if (description.trim().length < 50)
    add({
      id: "geo-description",
      area: "geo",
      status: "warning",
      priority: "moyenne",
      title: "Présentation de l’activité trop courte",
      detail: "La description de l’établissement fait moins de 50 caractères.",
      fix: "Décrivez en une ou deux phrases ce que vous proposez, pour qui et où.",
    });
  else
    add({
      id: "geo-description",
      area: "geo",
      status: "ok",
      title: "Présentation de l’activité",
      detail: `${description.trim().length} caractères.`,
    });
  const sameAs = config.business?.sameAs.length ?? 0;
  if (!sameAs && !input.settings?.googleBusinessUrl)
    add({
      id: "geo-profiles",
      area: "geo",
      status: "info",
      title: "Aucun profil officiel déclaré",
      detail: "Aucun lien vers vos réseaux ou fiches d’annuaire.",
      fix: "Ajoutez les profils que vous possédez (Studio › Référencement) : ils aident à relier votre site à votre établissement.",
    });
  const ai = config.seo.aiCrawlers ?? { search: true, training: true };
  add(
    ai.search
      ? {
          id: "geo-ai-search",
          area: "geo",
          status: "ok",
          title: "Robots de recherche IA autorisés",
          detail:
            "ChatGPT Search, Claude, Perplexity… peuvent consulter le site (sans garantie d’être cités).",
        }
      : {
          id: "geo-ai-search",
          area: "geo",
          status: "info",
          title: "Robots de recherche IA refusés",
          detail:
            "Les assistants IA de recherche ne peuvent pas consulter le site : il a peu de chances d’être cité dans leurs réponses.",
        },
  );
  if (config.seo.llmsTxt && !llmsEnabled(config))
    add({
      id: "geo-llms",
      area: "geo",
      status: "warning",
      priority: "basse",
      title: "llms.txt activé mais non publié",
      detail:
        "Le fichier n’est publié que lorsque l’indexation du site est activée.",
    });
  else if (llmsEnabled(config))
    add({
      id: "geo-llms",
      area: "geo",
      status: "ok",
      title: "llms.txt publié",
      detail: `${urls.canonicalBase}/llms.txt`,
    });

  /* ── Performance (static facts only; field data is not connected) ── */
  const fonts = [...new Set(Object.values(config.theme.fonts))].filter(
    (f) => f in WEB_FONTS,
  );
  const fontKB = fonts.reduce((n, f) => n + (WEB_FONTS[f] ?? 0), 0);
  if (fonts.length)
    add({
      id: "perf-fonts",
      area: "performance",
      status: fonts.length > 2 || fontKB > 400 ? "warning" : "info",
      priority: fonts.length > 2 || fontKB > 400 ? "basse" : undefined,
      title: "Polices web du thème",
      detail: `${fonts.length} police(s) téléchargée(s), environ ${fontKB} Ko.`,
      fix:
        fontKB > 400
          ? "Une police système pour le texte courant allège nettement le chargement."
          : undefined,
    });
  else
    add({
      id: "perf-fonts",
      area: "performance",
      status: "ok",
      title: "Polices système",
      detail: "Aucune police à télécharger.",
    });

  const counts = { ok: 0, info: 0, warning: 0, error: 0 };
  for (const c of checks) counts[c.status]++;
  return {
    version: 1,
    checkedAt: (input.now ?? new Date()).toISOString(),
    publishedAt: input.publishedAt,
    canonicalBase: urls.canonicalBase,
    indexable,
    stats: {
      indexablePages: keys.length,
      products: products.length,
      redirects: redirects.length,
    },
    counts,
    checks,
  };
}

/** Runs the audit for the restaurant of the current database context and stores it. */
export async function runSeoAudit(db: DB, restaurant: string, trigger: string) {
  const cms = website(restaurant);
  const config = await cms.getPublishedConfig(db);
  const [context, catalog, facts, domains] = [
    await cms.placeholderContext(db, config),
    await commerce(restaurant)
      .catalog(db)
      .catch(() => null),
    await seoFacts(db, restaurant),
    await rows<{ hostname: string; verified: boolean }>(
      db,
      "SELECT hostname,verified_at IS NOT NULL AS verified FROM restaurant_domains WHERE restaurant_id=$1 ORDER BY hostname",
      [restaurant],
    ),
  ];
  const report = auditSite({
    restaurant,
    config,
    context,
    settings: catalog?.settings ?? null,
    products: catalog?.products ?? [],
    primaryHost: facts.primaryHost,
    domains,
    publishedAt: facts.publishedAt,
    platformUrl: platformUrl(),
  });
  const [{ id }] = await rows<{ id: string }>(
    db,
    "SELECT app.record_seo_audit($1,$2,$3) AS id",
    [restaurant, trigger, JSON.stringify(report)],
  );
  return { id, report };
}
