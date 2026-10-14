import type { Metadata } from "next";
import "./globals.css";
import "./public-site.css";
export const metadata: Metadata = {
  title: "DATTIER OS · Le restaurant, en harmonie",
  description: "Démonstration locale du système opérationnel du Dattier Hefsi.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Le Dattier Hefsi",
    description: "Cuisine tunisienne et maghrébine · démonstration",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
