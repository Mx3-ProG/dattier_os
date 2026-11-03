import type { Metadata } from "next";
import { demoEnabled } from "@/lib/database/db";
import { Landing, type Account } from "@/components/landing";
import { authenticated } from "@/features/platform/http";
import { overview } from "@/features/platform/service";
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
/** The signed-in customer, if any, so the home page can open their own space directly. */
async function account(): Promise<Account | null> {
  try {
    const data = await authenticated(undefined, overview);
    return {
      name: data.user.name,
      restaurants: (data.restaurants as { id: string; name: string }[]).map(
        ({ id, name }) => ({ id, name }),
      ),
    };
  } catch {
    return null;
  }
}
export default async function Page() {
  return <Landing demo={demoEnabled()} account={await account()} />;
}
