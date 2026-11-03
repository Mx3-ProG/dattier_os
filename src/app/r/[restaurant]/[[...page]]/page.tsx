import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb, demoEnabled, one } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { actor } from "@/lib/auth/session";
import { website } from "@/features/cms/service";
import { plain } from "@/features/cms/text";
import { commerce } from "@/features/commerce/service";
import { seoFacts, platformUrl } from "@/features/seo/server";
import { siteUrls, pageUrl, absoluteMedia } from "@/features/seo/urls";
import { buildJsonLd, serializeJsonLd } from "@/features/seo/jsonld";
import { DonutStore } from "@/components/cms-site/store";
import { TenantSiteProvider } from "@/components/cms-site/context";
import "@/app/donuts.css";
import "@/app/site-sections.css";
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
          await db.exec("SET LOCAL ROLE dattier_app");
          await one(db, "SELECT id FROM restaurants WHERE id=$1", [restaurant]);
          const cms = website(restaurant);
          if (preview) await cms.siteScope(db, user!);
          const config = preview
            ? mode === "draft"
              ? await cms.getDraftConfig(db)
              : await cms.getVersionConfig(db, mode.slice(8))
            : await cms.getPublishedConfig(db);
          const route = raw === "account" ? "compte" : raw;
          const key = route || "home";
          if (
            !config.pages[key] ||
            (!preview &&
              config.pages[key].kind === "custom" &&
              !config.pages[key].visible)
          )
            notFound();
          // Public catalogue rendered server-side so menus and prices are in the HTML.
          const catalog = await commerce(restaurant)
            .catalog(db)
            .catch(() => null);
          const facts = await seoFacts(db, restaurant);
          return {
            restaurant,
            route,
            key,
            config,
            catalog,
            context: await cms.placeholderContext(db, config),
            preview,
            urls: siteUrls({
              restaurant,
              platformUrl: platformUrl(`http://${host || "127.0.0.1:3000"}`),
              primaryHost: facts.primaryHost,
              requestHost: host,
              demo: demoEnabled(),
            }),
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
  return loadSite(restaurant, page?.join("/") || "", mode, host);
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { config, context, key, preview, urls } = await load(props),
    page = config.pages[key];
  const title = plain(page.seo.title || config.seo.title, context),
    description = plain(
      page.seo.description || config.seo.description,
      context,
    );
  const origin = new URL(urls.canonicalBase).origin;
  const image = absoluteMedia(
    origin,
    page.seo.ogImage || config.seo.ogImage || config.branding.logo.src,
  );
  const canonical = pageUrl(urls.canonicalBase, key);
  const indexable =
    !demoEnabled() &&
    !preview &&
    config.seo.noIndex === false &&
    !page.seo.noIndex &&
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
      locale: "fr_FR",
      title,
      description,
      siteName: plain(config.seo.shareName, context),
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: page.seo.ogImage || config.seo.ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    ...(config.seo.favicon ? { icons: { icon: config.seo.favicon } } : {}),
  };
}
export default async function Page(props: Props) {
  const data = await load(props);
  const jsonLd = data.preview
    ? null
    : buildJsonLd({
        pageKey: data.key,
        config: data.config,
        context: data.context,
        canonicalBase: data.urls.canonicalBase,
        settings: data.catalog?.settings ?? null,
        products: data.catalog?.products ?? [],
      });
  return (
    <TenantSiteProvider
      restaurant={data.restaurant}
      demo={demoEnabled()}
      preview={data.preview}
      platformOrigin={demoEnabled() ? "" : process.env.APP_URL || ""}
    >
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <DonutStore
        route={data.route}
        config={data.config}
        context={data.context}
        preview={data.preview}
        initialData={data.catalog}
      />
    </TenantSiteProvider>
  );
}
