import type { SiteConfig } from "@/features/cms/schema";
import type { Product, Settings } from "@/features/commerce/schema";
import { plain, type PlaceholderContext } from "@/features/cms/text";
import { absoluteMedia, pageUrl } from "./urls";
import { siteLocale } from "./locale";

/** Schema.org types that accept hasMenu, servesCuisine and acceptsReservations. */
const FOOD_TYPES = new Set([
  "Restaurant",
  "FastFoodRestaurant",
  "CafeOrCoffeeShop",
  "Bakery",
  "BarOrPub",
  "IceCreamShop",
  "FoodEstablishment",
]);

/**
 * Schema.org JSON-LD for a restaurant site.
 *
 * Rules: only data that exists and is shown on the site; types chosen per page
 * (never every type on every page); no ratings, reviews or certifications are
 * generated. Self-hosted reviews are not used for the business (Google does not
 * accept self-serving reviews for LocalBusiness rich results).
 */
export type JsonLdInput = {
  pageKey: string;
  config: SiteConfig;
  context: PlaceholderContext;
  canonicalBase: string;
  settings: Settings | null;
  products: Product[];
  language?: string;
  currency?: string;
};
type Node = Record<string, unknown>;
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const compact = (o: Node): Node =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) =>
        v !== undefined &&
        v !== null &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    ),
  );
const visiblePage = (config: SiteConfig, key: string) =>
  !!config.pages[key]?.visible && config.pages[key].kind !== "protected";

export function buildJsonLd(input: JsonLdInput): Node | null {
  const { config, context, canonicalBase, settings, pageKey } = input;
  const page = config.pages[pageKey];
  if (!page) return null;
  const origin = new URL(canonicalBase).origin;
  const lang = input.language || siteLocale(config).language;
  const currency = input.currency || "EUR";
  const name = context.name || plain(config.seo.shareName, context);
  const businessId = `${canonicalBase}/#business`;
  const websiteId = `${canonicalBase}/#website`;
  const graph: Node[] = [];

  const identity = config.business;
  const type = identity?.type ?? "Restaurant";
  const food = FOOD_TYPES.has(type);
  // Online-only organisation: no premises, so no address, hours or position.
  const physical = type !== "Organization";
  const business = (): Node => {
    const hours = physical ? (settings?.hours ?? []) : [];
    const sameAs = [
      ...new Set(
        [settings?.googleBusinessUrl, ...(identity?.sameAs ?? [])].filter(
          (u): u is string => !!u && /^https:\/\//.test(u),
        ),
      ),
    ];
    return compact({
      "@type": type,
      "@id": businessId,
      name,
      url: `${canonicalBase}/`,
      description: plain(config.branding.description, context) || undefined,
      logo: absoluteMedia(origin, config.branding.logo.src) || undefined,
      image:
        absoluteMedia(origin, config.seo.ogImage || config.branding.logo.src) ||
        undefined,
      telephone: context.phone || undefined,
      email: config.branding.email || undefined,
      address: (physical && context.address) || undefined,
      geo:
        physical && identity?.geo
          ? {
              "@type": "GeoCoordinates",
              latitude: identity.geo.latitude,
              longitude: identity.geo.longitude,
            }
          : undefined,
      areaServed: identity?.areaServed.filter(Boolean),
      servesCuisine: food ? identity?.cuisines.filter(Boolean) : undefined,
      priceRange: identity?.priceRange || undefined,
      openingHoursSpecification: hours.map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${DAYS[h.day]}`,
        opens: h.open,
        closes: h.close,
      })),
      hasMenu: food && visiblePage(config, "carte")
        ? pageUrl(canonicalBase, "carte")
        : undefined,
      acceptsReservations: food && visiblePage(config, "reservations")
        ? true
        : undefined,
      sameAs,
    });
  };

  if (pageKey === "home") {
    graph.push(
      compact({
        "@type": "WebSite",
        "@id": websiteId,
        url: `${canonicalBase}/`,
        name,
        inLanguage: lang,
        publisher: { "@id": businessId },
      }),
      business(),
    );
  }
  if (pageKey === "contact") graph.push(business());

  if (pageKey === "carte") {
    const products = input.products.filter((p) => p.enabled);
    const categories = [...new Set(products.map((p) => p.category))];
    if (products.length)
      graph.push({
        "@type": "Menu",
        "@id": `${pageUrl(canonicalBase, "carte")}#menu`,
        name: plain(page.title, context),
        inLanguage: lang,
        hasMenuSection: categories.map((category) => ({
          "@type": "MenuSection",
          name: category,
          hasMenuItem: products
            .filter((p) => p.category === category)
            .map((p) =>
              compact({
                "@type": "MenuItem",
                name: p.name,
                description: p.description || undefined,
                image: p.images[0]
                  ? absoluteMedia(origin, p.images[0]) || undefined
                  : undefined,
                offers: {
                  "@type": "Offer",
                  price: (p.price / 100).toFixed(2),
                  priceCurrency: currency,
                  availability:
                    p.portions > 0
                      ? "https://schema.org/InStock"
                      : "https://schema.org/OutOfStock",
                },
              }),
            ),
        })),
      });
  }

  const faq = page.sections.flatMap((s) =>
    s.visible && s.type === "faq"
      ? s.props.items.filter((i) => i.question.trim() && i.answer.trim())
      : [],
  );
  if (faq.length)
    graph.push({
      "@type": "FAQPage",
      "@id": `${pageUrl(canonicalBase, pageKey)}#faq`,
      mainEntity: faq.map((i) => ({
        "@type": "Question",
        name: plain(i.question, context),
        acceptedAnswer: { "@type": "Answer", text: plain(i.answer, context) },
      })),
    });

  if (pageKey !== "home")
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: plain(config.pages.home?.title || "Accueil", context),
          item: pageUrl(canonicalBase, "home"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: plain(page.title, context),
          item: pageUrl(canonicalBase, pageKey),
        },
      ],
    });

  return graph.length
    ? { "@context": "https://schema.org", "@graph": graph }
    : null;
}

/** Serialises JSON-LD for an inline <script>, neutralising `</script>` injection. */
export function serializeJsonLd(data: Node) {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}
