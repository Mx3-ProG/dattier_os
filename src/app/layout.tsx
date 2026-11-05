import type { Metadata } from "next";
import "./globals.css";
import "./fonts.css";
import "./public-site.css";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  applicationName: "Dattier OS",
  title: "DATTIER OS · Le restaurant, en harmonie",
  description:
    "Le système ouvert pour gérer les commandes, stocks, équipes et clients de vos restaurants.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Dattier OS",
    title: "Dattier OS · Tout votre restaurant dans un seul OS",
    description:
      "Commandes, salle, réservations, stocks, équipe, site web et boutique : le logiciel de gestion ouvert des restaurateurs.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dattier OS · Tout votre restaurant dans un seul OS",
    description:
      "Commandes, salle, réservations, stocks, équipe, site web et boutique : le logiciel de gestion ouvert des restaurateurs.",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
