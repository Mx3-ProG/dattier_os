import Link from "next/link";
import { demoEnabled } from "@/lib/database/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { SITE_HEADER, DEFAULT_LOCALE } from "@/features/seo/locale";
import { siteLanguage } from "@/features/seo/server";
import "./globals.css";
import "./fonts.css";
import "./public-site.css";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://atacuisine.vercel.app"),
  applicationName: "atacuisine",
  title: "atacuisine · Le restaurant, en harmonie",
  description:
    "Le système ouvert pour gérer les commandes, stocks, équipes et clients de vos restaurants.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "atacuisine",
    description: "Le système ouvert pour les restaurateurs",
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
  return (
    <html lang={lang}>
      <body>
        {children}
        {demoEnabled() && (
          <Link
            className="demo-purchase-link"
            href={process.env.ATACUISINE_PURCHASE_URL || "/#offres"}
          >
            Voir les offres
          </Link>
        )}
      </body>
    </html>
  );
}
