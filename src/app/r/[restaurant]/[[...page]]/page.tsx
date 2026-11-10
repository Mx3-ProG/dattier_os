import { restaurantPlan } from "@/features/platform/entitlements";
import { productPath } from "@/lib/product-pages";
import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getDb, demoEnabled, one } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { actor } from "@/lib/auth/session";
import { website } from "@/features/cms/service";
import { plain } from "@/features/cms/text";
import { commerce } from "@/features/commerce/service";
import { publicOffers } from "@/features/offers/service";
import { seoFacts, platformUrl } from "@/features/seo/server";
import { siteUrls, pageUrl, absoluteMedia } from "@/features/seo/urls";
import { buildJsonLd, serializeJsonLd } from "@/features/seo/jsonld";
import { findRedirect, siteLocale } from "@/features/seo/locale";
import { effectiveTitle, effectiveDescription } from "@/features/seo/meta";
import { DonutStore } from "@/components/cms-site/store";
import { TenantSiteProvider } from "@/components/cms-site/context";
import { AudienceBeacon } from "@/components/cms-site/audience-beacon";
import { SiteLoaderSync } from "@/components/cms-site/site-loader";
import { effectiveSiteLoader } from "@/features/cms/site-addons";
import { isAudienceMode } from "@/features/analytics/consent";
import "@/app/donuts.css";
import "@/app/site-sections.css";
import "@/app/customer-account.css";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ restaurant: string; page?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
/** Memoised per request: metadata and page share a single database round. */
const loadSite = cache(
  async (restaurant: string, raw: string, mode: string, host: string) => {
    const preview = mode === "draft" || /^version:[a-f0-9-]{36}$/.test(mode);
    const user = preview ? await actor().catch(() => null) : null;
    if (preview && !user) notFound();
    return withDatabaseContext(
      { restaurantId: restaurant, public: !preview, userId: user?.id },
      async () =>
        (await getDb()).transaction(async (db) => {
          await db.exec("SET LOCAL ROLE atacuisine_app");
          await one(db, "SELECT id FROM restaurants WHERE id=$1", [restaurant]);
          const plan = await restaurantPlan(db, restaurant);
          const { websiteInstalled, shopInstalled } = await one<{ websiteInstalled: boolean; shopInstalled: boolean }>(
            db,
            'SELECT app.addon_installed($1,\'website\') AS "websiteInstalled", app.addon_installed($1,\'online-orders\') AS "shopInstalled"',
            [restaurant],
          );
          if (
            plan < 39 || !websiteInstalled ||
            ((!shopInstalled || plan < 39) && ["commander", "checkout", "panier"].includes(raw))
          )
            notFound();
          const cms = website(restaurant);
          if (preview) await cms.siteScope(db, user!);
          const config = preview
            ? mode === "draft"
              ? await cms.getDraftConfig(db)
              : await cms.getVersionConfig(db, mode.slice(8))
            : await cms.getPublishedConfig(db);
          const estimationEnabled = (await one<{ enabled: boolean }>(db,
            "SELECT app.estimation_public($1) IS NOT NULL AS enabled", [restaurant])).enabled;
          const route = raw === "account" ? "compte" : raw;
          const isProduct = /^produits\/[^/]+$/.test(route);
          const key = isProduct ? "carte" : route || "home";
          const facts = await seoFacts(db, restaurant);
          const urls = siteUrls({
            restaurant,
            platformUrl: platformUrl(`http://${host || "127.0.0.1:3000"}`),
            primaryHost: facts.primaryHost,
            requestHost: host,
            demo: demoEnabled(),
          });
          if (
            !config.pages[key] ||
            (!preview &&
              config.pages[key].kind === "custom" &&
              !config.pages[key].visible)
          ) {
            // Former address of a renamed or removed page: one configured hop.
            const target = preview ? null : findRedirect(config, raw);
            if (target)
              return {
                redirect: target.to.startsWith("/")
                  ? urls.servedBase + target.to
                  : target.to,
                permanent: target.permanent,
              } as const;
            notFound();
          }
          // Public catalogue rendered server-side so menus and prices are in the HTML.
          const catalog = await commerce(restaurant)
            .catalog(db)
            .catch(() => null);
          const product = isProduct
            ? catalog?.products.find(
                (p) => p.id === route.slice("produits/".length),
              )
            : undefined;
          if (isProduct && !product) notFound();
          return {
            product,
            siteAddons: await cms.siteAddons(db),
            offers: await publicOffers(db, restaurant),
            redirect: null,
            shopEnabled: plan >= 39 && shopInstalled,
            estimationEnabled,
            restaurant,
            route,
            key,
            config,
            catalog,
            context: await cms.placeholderContext(db, config),
            preview,
            urls,
            publishedAt: facts.publishedAt,
            // Le collecteur n’existe sur la page que si l’établissement l’a activé.
            audience: preview
              ? null
              : (
                  await db.query<{ mode: string | null }>(
                    "SELECT app.analytics_public_config($1) AS mode",
                    [restaurant],
                  )
                ).rows[0]?.mode ?? null,
          };
        }),
    );
  },
);
async function load(props: Props) {
  const { restaurant, page } = await props.params,
    query = await props.searchParams;
  const mode = typeof query.cms === "string" ? query.cms : "";
  const host = (await headers()).get("host") || "";
  const data = await loadSite(restaurant, page?.join("/") || "", mode, host);
  if (data.redirect !== null) {
    if (data.permanent) permanentRedirect(data.redirect);
    redirect(data.redirect);
  }
  return data;
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { config, context, key, preview, urls, product } = await load(props),
    page = config.pages[key];
  const title = product
    ? product.seo_title || `${product.name} · ${context.name}`
    : effectiveTitle(config, key, context);
  const description = product
    ? product.seo_description ||
      product.description.slice(0, 200) ||
      `Découvrez ${product.name} à la carte de ${context.name}.`
    : effectiveDescription(config, key, context);
  const origin = new URL(urls.canonicalBase).origin;
  const image = absoluteMedia(
    origin,
    product?.images[0] ||
      page.seo.ogImage ||
      config.seo.ogImage ||
      config.branding.logo.src,
  );
  const canonical = product
    ? urls.canonicalBase + productPath(product.id)
    : pageUrl(urls.canonicalBase, key);
  const locale = siteLocale(config);
  const indexable =
    !demoEnabled() &&
    !preview &&
    config.seo.noIndex === false &&
    !page.seo.noIndex &&
    (!product || page.visible) &&
    page.kind !== "protected";
  return {
    metadataBase: new URL(origin),
    alternates: { canonical },
    title,
    description,
    robots: { index: indexable, follow: !demoEnabled() && !preview },
    openGraph: {
      type: "website",
      url: canonical,
      ...(locale.ogLocale ? { locale: locale.ogLocale } : {}),
      title,
      description,
      siteName: plain(config.seo.shareName, context),
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card:
        page.seo.ogImage || config.seo.ogImage
          ? "summary_large_image"
          : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    ...(config.seo.favicon ? { icons: { icon: config.seo.favicon } } : {}),
  };
}
export default async function Page(props: Props) {
  const data = await load(props);
  const { categorie } = await props.searchParams;
  const category =
    data.route === "carte" &&
    typeof categorie === "string" &&
    data.catalog?.settings.categories.includes(categorie)
      ? categorie
      : "Tout";
  const jsonLd =
    data.preview || data.product
      ? null
      : buildJsonLd({
          pageKey: data.key,
          config: data.config,
          context: data.context,
          canonicalBase: data.urls.canonicalBase,
          settings: data.catalog?.settings ?? null,
          products: data.catalog?.products ?? [],
          dateModified: data.publishedAt,
        });
  // <html lang> is set by the root layout from the same setting (see src/app/layout.tsx).
  return (
    <TenantSiteProvider
      restaurant={data.restaurant}
      demo={demoEnabled()}
      shopEnabled={data.shopEnabled}
      preview={data.preview}
      platformOrigin={demoEnabled() ? "" : process.env.APP_URL || ""}
      audience={isAudienceMode(data.audience) ? data.audience : null}
    >
      {isAudienceMode(data.audience) && <AudienceBeacon />}
      {!data.preview && (
        <SiteLoaderSync
          renderer={effectiveSiteLoader(data.config.branding.loader, data.siteAddons.loadingScreens)}
          primary={data.config.theme.colors.primary}
          name={data.config.branding.publicName || data.context.name || ""}
        />
      )}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <DonutStore
        key={category}
        initialCategory={category}
        route={data.route}
        config={data.config}
        context={data.context}
        preview={data.preview}
        initialData={data.catalog}
        detailProduct={data.product}
        updatedAt={data.publishedAt}
        estimationEnabled={data.estimationEnabled}
        siteAddons={data.siteAddons}
        offers={data.offers}
      />
    </TenantSiteProvider>
  );
}
