import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb, demoEnabled, one } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { actor } from "@/lib/auth/session";
import { website } from "@/features/cms/service";
import { plain } from "@/features/cms/text";
import { DonutStore } from "@/components/cms-site/store";
import { TenantSiteProvider } from "@/components/cms-site/context";
import "@/app/donuts.css";
import "@/app/site-sections.css";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ restaurant: string; page?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
async function load(props: Props) {
  const { restaurant, page } = await props.params,
    query = await props.searchParams;
  const mode = typeof query.cms === "string" ? query.cms : "";
  const preview = mode === "draft" || /^version:[a-f0-9-]{36}$/.test(mode);
  const user = preview ? await actor().catch(() => null) : null;
  if (preview && !user) notFound();
  return withDatabaseContext(
    { restaurantId: restaurant, public: !preview, userId: user?.id },
    async () => {
      return (await getDb()).transaction(async (db) => {
        await db.exec("SET LOCAL ROLE dattier_app");
        await one(db, "SELECT id FROM restaurants WHERE id=$1", [restaurant]);
        const cms = website(restaurant);
        if (preview) await cms.siteScope(db, user!);
        const config = preview
          ? mode === "draft"
            ? await cms.getDraftConfig(db)
            : await cms.getVersionConfig(db, mode.slice(8))
          : await cms.getPublishedConfig(db);
        const raw = page?.join("/") || "",
          route = raw === "account" ? "compte" : raw;
        const key = route || "home";
        if (
          !config.pages[key] ||
          (!preview &&
            config.pages[key].kind === "custom" &&
            !config.pages[key].visible)
        )
          notFound();
        return {
          restaurant,
          route,
          config,
          context: await cms.placeholderContext(db, config),
          preview,
        };
      });
    },
  );
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { config, context, route, preview, restaurant } = await load(props),
    page = config.pages[route || "home"];
  const title = plain(page.seo.title || config.seo.title, context),
    description = plain(
      page.seo.description || config.seo.description,
      context,
    ),
    image = page.seo.ogImage || config.seo.ogImage;
  const h = await headers();
  const platform = new URL(process.env.APP_URL || "http://127.0.0.1:3101");
  const host = h.get("host") || platform.host;
  const origin = new URL(
    `${demoEnabled() ? "http:" : platform.protocol}//${host}`,
  );
  const prefix =
    host === platform.host || demoEnabled() ? `/r/${restaurant}` : "";
  return {
    metadataBase: origin,
    alternates: { canonical: prefix + (route ? `/${route}` : "/") },
    title,
    description,
    robots: {
      index:
        !demoEnabled() &&
        !preview &&
        config.seo.noIndex === false &&
        !page.seo.noIndex &&
        !["protected"].includes(page.kind),
      follow: !demoEnabled() && !preview,
    },
    openGraph: {
      title,
      description,
      siteName: plain(config.seo.shareName, context),
      ...(image ? { images: [image] } : {}),
    },
    ...(config.seo.favicon ? { icons: { icon: config.seo.favicon } } : {}),
  };
}
export default async function Page(props: Props) {
  const data = await load(props);
  return (
    <TenantSiteProvider
      restaurant={data.restaurant}
      demo={demoEnabled()}
      preview={data.preview}
      platformOrigin={demoEnabled() ? "" : process.env.APP_URL || ""}
    >
      <DonutStore
        route={data.route}
        config={data.config}
        context={data.context}
        preview={data.preview}
      />
    </TenantSiteProvider>
  );
}
