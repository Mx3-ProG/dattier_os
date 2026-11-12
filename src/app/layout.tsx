import { TrialReminder } from "@/components/platform/trial-reminder";
import { PublicModeProvider } from "@/components/cms-site/public-appearance";
import Link from "next/link";
import { ServiceWorkerUpdate } from "@/components/service-worker-update";
import { demoEnabled } from "@/infrastructure/database/db";
import type { Metadata } from "next";
import { AppearanceApplication } from "@/components/appearance/appearance";
import { readAppearance } from "@/features/appearance/service";
import { authenticated } from "@/features/platform/http";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { SITE_HEADER, DEFAULT_LOCALE } from "@/features/seo/locale";
import { siteLanguage } from "@/features/seo/server";
import "./globals.css";
import "./fonts.css";
import "./public-site.css";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://atacuisine.vercel.app"),
  applicationName: "STUDIO S",
  title: "STUDIO S · Votre espace professionnel",
  description:
    "Un outil complet pour gagner du temps dans votre commerce : clients, ventes, stocks, équipe et site web.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "STUDIO S",
    description: "Le bureau dans la poche : un outil complet pour gagner du temps dans votre commerce.",
  },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Restaurant sites declare their own language; the platform stays French.
  const site = (await headers()).get(SITE_HEADER);
  const lang = site ? await siteLanguage(site) : DEFAULT_LOCALE.language;
  const jar = await cookies();
  const initial =
    !site && (jar.has("atacuisine_session") || jar.has("atacuisine_identity"))
      ? await authenticated(undefined, (db, user) =>
          readAppearance(db, user.id),
        ).catch(() => undefined)
      : undefined;
  const publicMode = jar.get("atacuisine_public_mode")?.value;
  return (
    <html lang={lang}>
      <body>
        <PublicModeProvider
          initialMode={
            publicMode === "dark" || publicMode === "light"
              ? publicMode
              : "system"
          }
        >
          <AppearanceApplication initial={initial} publicSite={!!site}>
            <ServiceWorkerUpdate />
            {children}
            {!site && <TrialReminder />}
            {demoEnabled() && (
              <Link
                className="demo-purchase-link"
                href={process.env.ATACUISINE_PURCHASE_URL || "/#offres"}
              >
                Voir les offres
              </Link>
            )}
          </AppearanceApplication>
        </PublicModeProvider>
      </body>
    </html>
  );
}
