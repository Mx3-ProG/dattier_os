import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb, demoEnabled, one, rows } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { NONCE_HEADER } from "@/lib/security/csp";
import { restaurantPlan } from "@/features/platform/entitlements";
import { website } from "@/features/cms/service";
import { fonts } from "@/features/cms/theme";
import { commerce } from "@/features/commerce/service";
import { premiumActive } from "@/features/commerce/premium";
import { TenantSiteProvider } from "@/components/cms-site/context";
import { KioskOrder } from "@/components/cms-site/kiosk-order";
import "@/app/kiosk.css";

export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ restaurant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Borne de commande (Click & Collect Premium) : site publié, boutique et Premium actifs. */
async function loadKiosk(restaurant: string) {
  return withDatabaseContext({ restaurantId: restaurant, public: true }, async () =>
    (await getDb()).transaction(async (db) => {
      await db.exec("SET LOCAL ROLE atacuisine_app");
      const [place] = await rows<{ name: string }>(db, "SELECT name FROM restaurants WHERE id=$1", [restaurant]);
      if (!place) notFound();
      const { websiteInstalled } = await one<{ websiteInstalled: boolean }>(
        db,
        "SELECT app.addon_installed($1,'website') AS \"websiteInstalled\"",
        [restaurant],
      );
      if ((await restaurantPlan(db, restaurant)) < 39 || !websiteInstalled || !(await premiumActive(db, restaurant)))
        notFound();
      const config = await website(restaurant).getPublishedConfig(db);
      const catalog = await commerce(restaurant).catalog(db);
      return { config, catalog, name: place.name };
    }),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { restaurant } = await params;
  const { config, name } = await loadKiosk(restaurant);
  return {
    title: `Commander · ${config.branding.publicName || name}`,
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params, searchParams }: Props) {
  const { restaurant } = await params;
  const query = await searchParams;
  const { config, catalog, name } = await loadKiosk(restaurant);
  const colors = config.theme.colors;
  return (
    <TenantSiteProvider
      restaurant={restaurant}
      demo={demoEnabled()}
      shopEnabled
      nonce={(await headers()).get(NONCE_HEADER) ?? undefined}
      platformOrigin={demoEnabled() ? "" : process.env.APP_URL || ""}
    >
      <KioskOrder
        initialData={catalog}
        tablet={query.tablette === "1"}
        brand={{
          name: config.branding.publicName || name,
          logo: config.branding.logo.src || "",
          primary: colors.primary,
          primaryDark: colors.primaryDark,
          accent: colors.accent,
          background: colors.background,
          text: colors.text,
          heading: fonts[config.theme.fonts.heading].stack,
          body: fonts[config.theme.fonts.body].stack,
        }}
      />
    </TenantSiteProvider>
  );
}
