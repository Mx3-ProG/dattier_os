/* FLUX : transforme un plan en configuration de site, à partir du brouillon
   actuel. Pur et déterministe. Ne touche qu’à ce qu’un administrateur peut
   déjà modifier lui-même dans l’éditeur : identité visuelle, textes, page
   d’accueil (sections libres). Pages légales, protégées, commerce et pages
   créées restent intactes ; les add-ons ne sont posés que s’ils sont acquis. */
import { siteTemplates, applySiteTemplate } from "@/features/cms/templates";
import { registry } from "@/features/cms/registry";
import { siteConfigSchema, type Section, type SectionType, type SiteConfig } from "@/features/cms/schema";
import { addonSectionAddons, type SiteAddonData } from "@/features/cms/site-addons";
import { fluxColors } from "./palette";
import type { FluxGoal, FluxPlan } from "./plan";

export type FluxBuildContext = {
  addons: SiteAddonData;
  /** Types de sections que cet établissement peut ajouter (réglages du CMS). */
  allowedTypes: readonly SectionType[];
};

const goalLink: Record<FluxGoal, string> = {
  order: "/commander",
  reserve: "/reservations",
  contact: "/contact",
};
const badgeIcons = ["bag", "clock", "card", "star"] as const;
/** Identifiants stables : relancer FLUX met à jour ses sections au lieu d’en empiler. */
export const fluxSectionId = (type: SectionType) => `flux-${type.toLowerCase()}`;

function fresh<T extends SectionType>(type: T, props: Extract<Section, { type: T }>["props"]): Section {
  return { id: fluxSectionId(type), type, lock: 1, visible: true, required: false, props } as Section;
}

export function buildSite(base: SiteConfig, plan: FluxPlan, ctx: FluxBuildContext): SiteConfig {
  const template = siteTemplates.find((t) => t.id === plan.layout && !t.premium) ?? siteTemplates[0];
  const next = applySiteTemplate(base, template, true);
  const link = goalLink[plan.goal];
  const owned = (list: { id: string }[], id: string | null) =>
    id && list.some((entry) => entry.id === id) ? { product: id } : undefined;

  /* Identité visuelle */
  next.theme = {
    ...next.theme,
    presentation: { layout: template.id as FluxPlan["layout"], stickyHeader: false, stickyAction: "none", motion: false, surprise: false },
    colors: fluxColors(plan.colors),
    fonts: { heading: plan.fonts.heading, body: plan.fonts.body, button: plan.fonts.body },
  };
  if (plan.name) next.branding.publicName = plan.name;
  next.branding.description = plan.description;
  next.branding.announcement = plan.announcement;
  const loader = owned(ctx.addons.loadingScreens, plan.extras.loader);
  const background = owned(ctx.addons.backgrounds, plan.extras.background);
  const decoration = owned(ctx.addons.decorations, plan.extras.decoration);
  const notFound = owned(ctx.addons.notFoundPages, plan.extras.notFound);
  if (loader) next.branding.loader = loader;
  if (background) next.branding.background = background;
  if (decoration) next.branding.decoration = decoration;
  if (notFound)
    next.branding.notFound = {
      title: next.branding.notFound?.title ?? "Cette page s’est fait la malle",
      message: next.branding.notFound?.message ?? "Revenez à l’accueil, tout le reste est là.",
      button: next.branding.notFound?.button ?? "Retour à l’accueil",
      ...notFound,
    };
  next.header.orderLabel = plan.goal === "reserve" ? "Réserver" : plan.goal === "contact" ? "Contact" : next.header.orderLabel || "Commander";
  next.footer.tagline = plan.footer.tagline;
  next.footer.cta = plan.footer.cta;
  next.seo.title = plan.seo.title;
  next.seo.description = plan.seo.description;
  if (plan.name) next.seo.shareName = plan.name;

  /* Page d’accueil : on réécrit les sections libres, on n’efface rien. */
  const home = next.pages.home;
  if (!home) return next;
  for (const section of home.sections) {
    if (section.lock !== 1) continue;
    switch (section.type) {
      case "hero":
        section.visible = true;
        section.props.kicker = plan.hero.kicker;
        section.props.title = plan.hero.title;
        section.props.lead = plan.hero.lead;
        section.props.primary = { label: plan.hero.primaryLabel, href: link };
        section.props.secondary = {
          label: plan.hero.secondaryLabel,
          href: plan.goal === "order" ? "/carte" : "#specialites",
        };
        section.props.badges = plan.hero.badges.map((label, i) => ({ icon: badgeIcons[i % badgeIcons.length], label }));
        break;
      case "marquee":
        section.visible = true;
        section.props.items = plan.marquee;
        break;
      case "featuredProducts":
        section.visible = true;
        section.props.kicker = plan.products.kicker;
        section.props.title = plan.products.title;
        section.props.aside = plan.products.aside;
        section.props.limit = Math.max(section.props.limit, 6);
        section.props.allLink = { label: plan.goal === "order" ? "Tout voir et commander" : "Toute la carte", href: plan.goal === "order" ? "/commander" : "/carte" };
        break;
      case "about":
        section.visible = true;
        section.props.kicker = plan.about.kicker;
        section.props.title = plan.about.title;
        section.props.paragraphs = plan.about.paragraphs;
        section.props.cta = { label: plan.hero.primaryLabel, href: link };
        break;
      case "visit":
        section.props.cta = { label: plan.cta.label, href: link };
        break;
    }
  }

  const allowed = (type: SectionType) => ctx.allowedTypes.includes(type) && registry[type].addable;
  const upsert = (section: Section, before?: SectionType) => {
    const at = home.sections.findIndex((s) => s.id === section.id);
    if (at >= 0) {
      // Section déjà posée par FLUX : on garde sa place, on remplace son contenu.
      if (home.sections[at].lock === 1 && home.sections[at].type === section.type) home.sections[at] = section;
      return;
    }
    const anchor = before ? home.sections.findIndex((s) => s.type === before) : -1;
    if (anchor >= 0) home.sections.splice(anchor, 0, section);
    else home.sections.push(section);
  };

  const addonTypes = plan.addonSections.filter(
    (type) => ctx.addons.installed.includes(addonSectionAddons[type]) && allowed(type) && registry[type].create,
  );
  // Sections posées par une demande précédente et absentes de celle-ci : FLUX les retire.
  const wanted = new Set<string>([...addonTypes, ...(plan.faq.length ? ["faq"] : []), "cta"].map((t) => fluxSectionId(t as SectionType)));
  home.sections = home.sections.filter((s) => !s.id.startsWith("flux-") || s.lock !== 1 || wanted.has(s.id));

  /* Modules d’add-ons déjà installés, placés après les produits. */
  for (const type of addonTypes) upsert(fresh(type, registry[type].create!() as never), "about");
  if (plan.faq.length && allowed("faq"))
    upsert(fresh("faq", { kicker: "QUESTIONS FRÉQUENTES", title: "Tout ce qu’il faut *savoir*", items: plan.faq }), "map");
  if (allowed("cta"))
    upsert(fresh("cta", { title: plan.cta.title, text: plan.cta.text, link: { label: plan.cta.label, href: link }, tone: "dark" }));

  return siteConfigSchema.parse(next) as SiteConfig;
}
