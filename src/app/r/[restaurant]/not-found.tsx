import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteNotFound } from "@/components/cms-site/site-not-found";
import { website } from "@/features/cms/service";
import { effectiveNotFound, emptySiteAddons, notFoundDefaults } from "@/features/cms/site-addons";
import { SITE_HEADER } from "@/features/seo/locale";
import { seoFacts, platformUrl } from "@/features/seo/server";
import { siteUrls } from "@/features/seo/urls";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { demoEnabled, getDb } from "@/infrastructure/database/db";

export const metadata: Metadata = { title: "Page introuvable", robots: { index: false, follow: false } };

/** 404 d’un site d’établissement : son modèle, ses textes et ses couleurs, jamais ceux de la plateforme. */
export default async function SiteNotFoundPage() {
  const list = await headers();
  const restaurant = list.get(SITE_HEADER);
  const host = list.get("host") || "";
  const site = restaurant
    ? await withDatabaseContext({ restaurantId: restaurant, public: true }, async () =>
        (await getDb()).transaction(async (db) => {
          await db.exec("SET LOCAL ROLE atacuisine_app");
          const cms = website(restaurant);
          const config = await cms.getPublishedConfig(db);
          const facts = await seoFacts(db, restaurant);
          const urls = siteUrls({
            restaurant,
            platformUrl: platformUrl(`http://${host || "127.0.0.1:3000"}`),
            primaryHost: facts.primaryHost,
            requestHost: host,
            demo: demoEnabled(),
          });
          const context = await cms.placeholderContext(db, config);
          return { config, addons: await cms.siteAddons(db), home: urls.servedBase || "/", name: config.branding.publicName || context.name || "" };
        }),
      ).catch(() => null)
    : null;
  if (!site)
    return (
      <SiteNotFound design="plate" title={notFoundDefaults.title} message={notFoundDefaults.message}
        button={notFoundDefaults.button} home="/" brand="" colors={{ primary: "#344d3e", background: "#f8f5ed", text: "#2f4034" }} />
    );
  const { config, addons, home, name } = site;
  const choice = config.branding.notFound;
  return (
    <SiteNotFound
      design={effectiveNotFound(choice, addons?.notFoundPages ?? emptySiteAddons.notFoundPages)}
      title={choice?.title || notFoundDefaults.title}
      message={choice?.message || notFoundDefaults.message}
      button={choice?.button || notFoundDefaults.button}
      home={home}
      brand={name}
      logo={config.branding.logo.src}
      colors={{ primary: config.theme.colors.primary, background: config.theme.colors.background, text: config.theme.colors.text }}
    />
  );
}
