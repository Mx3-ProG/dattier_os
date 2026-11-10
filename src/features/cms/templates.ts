import { defaultTheme } from "./defaults";
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
  theme: {
    ...structuredClone(defaultTheme),
    presentation: {
      layout: id as Presentation["layout"],
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
      text: "#26201f",
      muted: "#625b55",
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
    "Une table chaleureuse, une carte à l’honneur et une adresse facile à trouver.",
    false,
    "#7c3028",
    "#fff8ef",
    "dmSerif",
    "Le goût des *bons moments.*",
    ["hero", "featuredProducts", "about", "visit", "reviews", "map", "marquee"],
  ),
  template(
    "jardin",
    "Le Jardin",
    "Cuisine végétale",
    "Une ambiance lumineuse, des couleurs naturelles et une place pour votre histoire.",
    false,
    "#28543d",
    "#f5f8ed",
    "fraunces",
    "Une cuisine *pleine de vie.*",
    ["hero", "about", "featuredProducts", "reviews", "visit", "map", "marquee"],
  ),
  template(
    "comptoir",
    "Le Comptoir",
    "Street food & à emporter",
    "La commande au premier plan, une typographie franche et une navigation directe.",
    false,
    "#993d13",
    "#fff8e8",
    "poppins",
    "Une faim. *Une vraie envie.*",
    ["hero", "featuredProducts", "marquee", "visit", "about", "reviews", "map"],
  ),
  template(
    "pause",
    "La Pause",
    "Café & pâtisserie",
    "Une palette douce pour les petites pauses et les grandes gourmandises.",
    false,
    "#84415c",
    "#fff5f8",
    "nunito",
    "Votre pause *préférée.*",
    ["hero", "marquee", "featuredProducts", "about", "visit", "reviews", "map"],
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
    ["hero", "about", "reviews", "featuredProducts", "visit", "map", "marquee"],
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
    ["hero", "featuredProducts", "visit", "about", "reviews", "map", "marquee"],
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
    ["hero", "about", "featuredProducts", "visit", "reviews", "map", "marquee"],
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
    ["hero", "marquee", "about", "featuredProducts", "reviews", "visit", "map"],
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
    home.sections.sort((a, b) => {
      const rank = (type: string) => {
        const i = template.order.indexOf(type);
        return i < 0 ? template.order.length : i;
      };
      return rank(a.type) - rank(b.type);
    });
    for (const section of home.sections) {
      if (section.type === "hero" && section.lock === 1) {
        section.props.title = template.title;
        section.props.kicker = template.kicker;
        section.props.image = {
          src: template.image,
          alt: `Illustration du modèle ${template.name} — à remplacer par votre photo`,
        };
        section.props.floatingText = "À partager";
        section.props.sticker =
          template.id === "comptoir" || template.id === "pause";
        section.props.primary =
          template.theme.presentation?.stickyAction === "reserve"
            ? { label: "Réserver une table", href: "/reservations" }
            : { label: "Découvrir la carte", href: "/carte" };
      }
    }
  }
  return next;
}
