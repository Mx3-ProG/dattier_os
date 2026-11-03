import type { Metadata } from "next";
import "./globals.css";
import "./fonts.css";
import "./public-site.css";
export const metadata: Metadata = {
  title: "DATTIER OS · Le restaurant, en harmonie",
  description:
    "Le système ouvert pour gérer les commandes, stocks, équipes et clients de vos restaurants.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Dattier OS",
    description: "Le système ouvert pour les restaurateurs",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
