import { defaultTheme } from "./defaults";
import { templateContent } from "./template-content";
import type { TemplateEffects } from "./effects";
import { registry } from "./registry";
import { isAddonSection } from "./site-addons";
import type { Section } from "./schema";
import type { FontId, SiteConfig, Theme, Presentation } from "./schema";

export type SiteTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  premium: boolean;
  theme: Theme;
  image: string;
  features: string[];
  title: string;
  kicker: string;
  order: string[];
  /** Signature d'effets : ce qui rend ce modèle unique à l'écran. */
  effects: TemplateEffects;
};
const template = (
  id: string,
  name: string,
  category: string,
  description: string,
  premium: boolean,
  primary: string,
  background: string,
  heading: FontId,
  title: string,
  order: string[],
  effects: TemplateEffects = {
    title: "none",
    button: "none",
    card: "none",
    badge: "none",
  },
  textColor: string = "#26201f",
  mutedColor: string = "#625b55",
  buttonTextColor: string = "#ffffff",
): SiteTemplate => ({
  image: `/cms/templates/${id}.svg`,
  features: premium
    ? [
        "En-tête fixe",
        "Barre d’action persistante",
        "Animations désactivables",
        "Clin d’œil interactif",
      ]
    : [
        "Navigation simple",
        "Composition personnalisable",
        "Textes, photos et polices libres",
      ],
  id,
  name,
  category,
  description,
  premium,
  title,
  kicker: category.toUpperCase(),
  order,
  effects,
  theme: {
    ...structuredClone(defaultTheme),
    presentation: {
      layout: id as Presentation["layout"],
      effects,
      stickyHeader: premium,
      stickyAction: premium
        ? id === "signature" || id === "atelier"
          ? "reserve"
          : "order"
        : "none",
      motion: premium,
      surprise: premium,
    },
    colors: {
      ...defaultTheme.colors,
      primary,
      primaryDark: primary,
      buttonBg: primary,
      background,
      accent: background,
      secondary: primary,
      text: textColor,
      muted: mutedColor,
      buttonText: buttonTextColor,
      link: primary,
    },
    fonts: { heading, body: "inter", button: "inter" },
    headingWeight: premium ? 600 : 800,
    headingScale: premium ? 1.1 : 1,
  },
});
export const siteTemplates: SiteTemplate[] = [
  template(
    "bistrot",
    "Le Bistrot",
    "Bistrot & brasserie",
    "Le zinc, la carte du jour et l’odeur du café : un bistrot qui se vit, pas qui se visite.",
    false,
    "#7c3028",
    "#fff8ef",
    "dmSerif",
    "Une table, une histoire, *un bistrot.*",
    ["hero", "about", "featuredProducts", "video", "marquee", "visit", "reviews", "map"],
    { title: "shine", button: "glare", card: "sheen", badge: "none" },
  ),
  template(
    "jardin",
    "Le Jardin",
    "Cuisine végétale",
    "Une ambiance lumineuse, des produits de saison et une table qui prend le temps.",
    false,
    "#28543d",
    "#f5f8ed",
    "fraunces",
    "Une cuisine *pleine de vie.*",
    ["hero", "featuredProducts", "marquee", "about", "video", "reviews", "visit", "map"],
    { title: "gradient", button: "glare", card: "sheen", badge: "gradient" },
  ),
  template(
    "comptoir",
    "Le Comptoir",
    "Street food & à emporter",
    "La commande au premier plan, une typographie franche et rien qui traîne.",
    false,
    "#993d13",
    "#fff8e8",
    "poppins",
    "Une faim. *Une vraie envie.*",
    ["hero", "featuredProducts", "marquee", "visit", "video", "about", "reviews", "map"],
    { title: "shine", button: "none", card: "streak", badge: "none" },
  ),
  template(
    "pause",
    "La Pause",
    "Café & pâtisserie",
    "Une palette douce, un café qui tire droit et des viennoiseries sorties du four.",
    false,
    "#84415c",
    "#fff5f8",
    "nunito",
    "Votre pause *préférée.*",
    ["hero", "marquee", "gallery", "featuredProducts", "about", "video", "visit", "reviews", "map"],
    { title: "none", button: "glare", card: "sheen", badge: "shine" },
  ),
  template(
    "signature",
    "Signature",
    "Restaurant gastronomique",
    "Une composition éditoriale, de grands titres et une histoire avant la carte.",
    true,
    "#514327",
    "#faf6ee",
    "playfair",
    "L’émotion *à votre table.*",
    ["hero", "about", "video", "featuredProducts", "marquee", "reviews", "visit", "map"],
    { title: "shine", button: "spark", card: "sheen", badge: "shine" },
  ),
  template(
    "riviera",
    "Riviera",
    "Cuisine méditerranéenne",
    "Un esprit bord de mer, une palette azur et une invitation au partage.",
    true,
    "#215475",
    "#f4f9fc",
    "dmSerif",
    "Le soleil *se partage.*",
    ["hero", "gallery", "featuredProducts", "visit", "about", "video", "reviews", "map"],
    { title: "gradient", button: "spark", card: "streak", badge: "gradient" },
  ),
  template(
    "atelier",
    "L’Atelier",
    "Table créative",
    "Une direction sobre et contemporaine qui met votre savoir-faire au centre.",
    true,
    "#43413e",
    "#faf9f6",
    "inter",
    "Le goût *du détail.*",
    ["hero", "video", "about", "featuredProducts", "visit", "reviews", "map", "marquee"],
    { title: "none", button: "glare", card: "streak", badge: "none" },
  ),
  template(
    "escale",
    "Escale",
    "Cuisines du monde",
    "Des teintes terracotta et une composition conviviale pour raconter vos inspirations.",
    true,
    "#853b28",
    "#fff4eb",
    "fraunces",
    "Le voyage *commence ici.*",
    ["hero", "marquee", "gallery", "about", "featuredProducts", "video", "reviews", "visit", "map"],
    { title: "gradient", button: "glare", card: "streak", badge: "shine" },
  ),
  template(
    "pizzeria",
    "La Pizzeria",
    "Pizzeria & trattoria",
    "Une ambiance chaleureuse, une carte généreuse et le four à bois au centre de la scène.",
    false,
    "#b91c1c",
    "#fff7ed",
    "dmSerif",
    "Le goût de *l’Italie.*",
    ["hero", "video", "marquee", "featuredProducts", "about", "reviews", "visit", "map"],
    { title: "gradient", button: "none", card: "sheen", badge: "none" },
  ),
  template(
    "sushi",
    "Le Sushi",
    "Cuisine japonaise",
    "L’épure, la précision et le silence : une table qui honore chaque geste.",
    true,
    "#111827",
    "#fafafa",
    "inter",
    "La précision *à votre table.*",
    ["hero", "about", "gallery", "featuredProducts", "video", "reviews", "visit", "map"],
    { title: "shine", button: "glare", card: "streak", badge: "gradient" },
  ),
  template(
    "coiffeur",
    "Le Salon",
    "Coiffure & beauté",
    "Une vitrine moderne, des services clairs et la prise de rendez-vous au premier plan.",
    false,
    "#9333ea",
    "#faf5ff",
    "poppins",
    "Votre style, *révélé.*",
    ["hero", "gallery", "featuredProducts", "about", "video", "reviews", "visit", "map"],
    { title: "shine", button: "glare", card: "none", badge: "gradient" },
  ),
  template(
    "loft",
    "Le Loft",
    "Immobilier & architecture",
    "Des volumes, de la lumière et une mise en scène éditoriale pour vos biens d’exception.",
    true,
    "#0f172a",
    "#f8fafc",
    "playfair",
    "L’espace *qui vous ressemble.*",
    ["hero", "gallery", "about", "featuredProducts", "video", "reviews", "visit", "map"],
    { title: "none", button: "spark", card: "sheen", badge: "none" },
  ),
  template(
    "chantier",
    "Le Chantier",
    "BTP & construction",
    "Robuste, clair et direct : vos réalisations et votre savoir-faire au premier plan.",
    false,
    "#92400e",
    "#fef3c7",
    "poppins",
    "On bâtit *ensemble.*",
    ["hero", "video", "about", "featuredProducts", "reviews", "visit", "map", "marquee"],
    { title: "none", button: "none", card: "streak", badge: "shine" },
  ),
  template(
    "racing",
    "La Racing",
    "Automobile & performance",
    "Vitesse, précision et design : une vitrine qui donne envie d’accélérer.",
    true,
    "#dc2626",
    "#0a0a0a",
    "inter",
    "Passez *à la vitesse supérieure.*",
    ["hero", "video", "featuredProducts", "marquee", "about", "reviews", "visit", "map"],
    { title: "shine", button: "spark", card: "streak", badge: "shine" },
    "#fafafa",
    "#a1a1aa",
  ),
  template(
    "manuscrit",
    "Le Manuscrit",
    "Blog & éditorial",
    "Une page qui se lit comme un livre : typographie soignée et rythme paisible.",
    false,
    "#3f3f46",
    "#fafaf9",
    "georgia",
    "Les mots *qui comptent.*",
    ["hero", "about", "blogList", "video", "featuredProducts", "reviews", "visit", "map"],
    { title: "gradient", button: "none", card: "none", badge: "gradient" },
  ),
  template(
    "assurance",
    "La Confiance",
    "Assurance & sécurité",
    "Sobre, rassurant et professionnel : inspirez confiance dès la première visite.",
    true,
    "#1e40af",
    "#f1f5f9",
    "inter",
    "Votre sécurité, *notre engagement.*",
    ["hero", "about", "featuredProducts", "reviews", "video", "visit", "map", "marquee"],
    { title: "none", button: "glare", card: "sheen", badge: "gradient" },
  ),
  template(
    "patisserie",
    "La Pâtisserie",
    "Pâtisserie & boulangerie",
    "Douce, gourmande et généreuse : vos créations sucrées au centre de la scène.",
    false,
    "#be185d",
    "#fff1f2",
    "fraunces",
    "Le sucré *qui fait sourire.*",
    ["hero", "gallery", "featuredProducts", "marquee", "about", "video", "reviews", "visit", "map"],
    { title: "shine", button: "none", card: "sheen", badge: "shine" },
  ),
  template(
    "streetfood",
    "Le Street",
    "Street food & food truck",
    "Énergie, néons et grande faim : une carte qui donne envie de croquer.",
    true,
    "#f97316",
    "#0c0a09",
    "poppins",
    "La faim *n’attend pas.*",
    ["hero", "marquee", "video", "featuredProducts", "visit", "about", "reviews", "map"],
    { title: "gradient", button: "spark", card: "sheen", badge: "none" },
    "#fafaf9",
    "#a8a29e",
    "#0c0a09",
  ),
  template(
    "compta",
    "Le Bilan",
    "Comptabilité & gestion",
    "Clair, structuré et professionnel : vos chiffres et services en toute confiance.",
    false,
    "#0f766e",
    "#f0fdfa",
    "inter",
    "Vos chiffres, *notre métier.*",
    ["hero", "video", "about", "featuredProducts", "visit", "map", "reviews", "marquee"],
    { title: "none", button: "glare", card: "none", badge: "none" },
  ),
  template(
    "ecole",
    "L’École",
    "Formation & éducation",
    "Dynamique et accueillant : programmes, équipe et vie de l’établissement.",
    true,
    "#7c3aed",
    "#faf5ff",
    "nunito",
    "Apprendre *avec plaisir.*",
    ["hero", "about", "video", "featuredProducts", "gallery", "reviews", "visit", "map"],
    { title: "shine", button: "spark", card: "none", badge: "gradient" },
  ),
  template(
    "gastronomique",
    "La Table",
    "Gastronomie & fine dining",
    "Éditorial, raffiné et silencieux : l’assiette et le geste au centre.",
    true,
    "#18181b",
    "#fafafa",
    "playfair",
    "L’art *de la table.*",
    ["hero", "video", "about", "featuredProducts", "map", "visit", "reviews", "marquee"],
    { title: "none", button: "spark", card: "streak", badge: "shine" },
  ),
  template(
    "baravin",
    "Le Cellier",
    "Bar à vins & tapas",
    "Sombre, convivial et chaleureux : soirées, partages et découvertes.",
    true,
    "#ef4444",
    "#1c1917",
    "dmSerif",
    "Le temps *se partage.*",
    ["hero", "marquee", "featuredProducts", "video", "about", "reviews", "visit", "map"],
    { title: "gradient", button: "spark", card: "streak", badge: "none" },
    "#fafaf9",
    "#a8a29e",
    "#fafaf9",
  ),
  template(
    "brunch",
    "Le Brunch",
    "Brunch & café moderne",
    "Lumineux, tendance et gourmand : le rendez-vous du week-end.",
    false,
    "#ea580c",
    "#fff7ed",
    "nunito",
    "Le matin *qui fait du bien.*",
    ["hero", "gallery", "marquee", "featuredProducts", "about", "video", "reviews", "visit", "map"],
    { title: "gradient", button: "glare", card: "streak", badge: "gradient" },
  ),
  template(
    "burger",
    "Le Burger",
    "Burger & fast casual",
    "Audacieux et direct : grands titres, couleurs vives, commande au premier plan.",
    false,
    "#dc2626",
    "#fef2f2",
    "poppins",
    "Une faim. *Une vraie.*",
    ["hero", "marquee", "featuredProducts", "video", "visit", "about", "reviews", "map"],
    { title: "shine", button: "none", card: "streak", badge: "gradient" },
  ),
];

/** Apply only presentation. Identity, legal text, commerce and custom pages survive. */
export function applySiteTemplate(
  config: SiteConfig,
  template: SiteTemplate,
  composition = false,
): SiteConfig {
  const next = structuredClone(config);
  next.theme = structuredClone(template.theme);
  if (composition && next.pages.home) {
    const home = next.pages.home;
    const content = templateContent[template.id];
    // Inject sections declared by the template but missing from the home page,
    // so each template can ship a richer, self-contained composition.
    const present = new Set(home.sections.map((sec) => sec.type));
    for (const type of template.order) {
      if (present.has(type as Section["type"])) continue;
      // Les sections d'add-on ne sont jamais injectées : leur accès dépend
      // de l'add-on installé par l'établissement.
      if (isAddonSection(type)) continue;
      const def = registry[type as keyof typeof registry];
      if (!def || !def.create) continue;
      const section = {
        id: `home-${String(type).toLowerCase()}`,
        type: type as Section["type"],
        lock: 1 as const,
        visible: true,
        required: false,
        props: def.create(),
      } as unknown as Section;
      home.sections.push(section);
      present.add(type as Section["type"]);
    }
    home.sections.sort((a, b) => {
      const rank = (type: string) => {
        const i = template.order.indexOf(type);
        return i < 0 ? template.order.length : i;
      };
      return rank(a.type) - rank(b.type);
    });
    for (const section of home.sections) {
      if (section.type === "hero" && section.lock === 1) {
        section.props.title = content?.hero?.title ?? template.title;
        section.props.kicker = content?.hero?.kicker ?? template.kicker;
        section.props.image = content?.hero?.image ?? {
          src: template.image,
          alt: `Illustration du modèle ${template.name} — à remplacer par votre photo`,
        };
        section.props.floatingText = content?.hero?.floatingText ?? "À partager";
        section.props.sticker =
          content?.hero?.sticker ?? (template.id === "comptoir" || template.id === "pause");
        section.props.lead = content?.hero?.lead ?? section.props.lead;
        section.props.badges =
          (content?.hero?.badges as typeof section.props.badges) ??
          section.props.badges;
        section.props.primary =
          content?.hero?.primary ??
          (template.theme.presentation?.stickyAction === "reserve"
            ? { label: "Réserver une table", href: "/reservations" }
            : { label: "Découvrir la carte", href: "/carte" });
        section.props.secondary = content?.hero?.secondary ?? section.props.secondary;
      }
      if (content) {
        const c = content as Record<string, unknown>;
        const override = c[section.type];
        if (override && typeof override === "object") {
          for (const [k, v] of Object.entries(override)) {
            if (v !== undefined) (section.props as Record<string, unknown>)[k] = v;
          }
        }
      }
    }
  }
  return next;
}
