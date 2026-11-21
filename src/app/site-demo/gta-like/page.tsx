import type { Metadata } from "next";
import { TenantSiteProvider } from "@/components/cms-site/context";
import { DonutStore } from "@/components/cms-site/store";
import { defaultConfig } from "@/features/cms/defaults";
import { applySiteTemplate, siteTemplates } from "@/features/cms/templates";
import "@/app/donuts.css";
import "@/app/site-sections.css";

export const metadata: Metadata = {
  title: "GTA Like · Aperçu du modèle",
  robots: { index: false, follow: false },
};

export default async function GtaLikePreview({
  searchParams,
}: {
  searchParams: Promise<{ studio?: string; page?: string }>;
}) {
  const { studio, page } = await searchParams;
  const tenant =
    studio && /^[a-z0-9_-]{1,80}$/i.test(studio) ? studio : undefined;
  const template = siteTemplates.find(
    (item) => item.id === "temps-des-donuts",
  )!;
  const config = applySiteTemplate(defaultConfig(), template, true);
  const name = "Le Temps des Donuts";
  config.branding.publicName = tenant ? "" : name;
  config.branding.announcement = "";
  config.branding.announcementHighlight = "";
  return (
    <TenantSiteProvider
      showcase={tenant ? undefined : "/site-demo/gta-like"}
      restaurant={tenant || "temps-des-donuts"}
      preview
      shopEnabled={false}
    >
      <DonutStore
        config={config}
        context={
          tenant
            ? {}
            : {
                name,
                address: "89 rue Thiers, 27300 Bernay",
                phone: "06 62 46 19 08",
              }
        }
        route={page && Object.hasOwn(config.pages,page) ? page : "home"}
        preview
        templateDemo={!tenant}
        initialData={
          tenant
            ? null
            : {
                settings: {
                  open: true,
                  prepMinutes: 15,
                  interval: 15,
                  capacity: 10,
                  categories: ["Donuts"],
                  logo: "",
                  address: "89 rue Thiers, 27300 Bernay",
                  phone: "06 62 46 19 08",
                  googleBusinessUrl: "",
                  googleReviewUrl: "",
                  hours: [2, 3, 4, 5, 6].map((day) => ({
                    day,
                    open: "10:00",
                    close: "20:00",
                  })),
                },
                products: [],
                slots: [],
                reviews: [],
                stripe: false,
              }
        }
      />
    </TenantSiteProvider>
  );
}
