import type { Metadata } from "next";
import { demoEnabled } from "@/lib/database/db";
import { Landing } from "@/components/landing";
import "./landing.css";
export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "Dattier OS · Tout votre restaurant dans un seul OS",
    description:
      "Commandes, salle, réservations, stocks, équipe, site web et boutique : le logiciel de gestion des restaurateurs, avec des données cloisonnées par structure.",
    robots: { index: !demoEnabled(), follow: !demoEnabled() },
  };
}
export default function Page() {
  return <Landing demo={demoEnabled()} />;
}
