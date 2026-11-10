import type { Metadata } from "next";
import { demoEnabled } from "@/lib/database/db";
import { Landing, type Account } from "@/components/landing";
import { authenticated } from "@/features/platform/http";
import { overview } from "@/features/platform/service";
import "./landing.css";
import "./legal.css";
export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "STUDIO OS · Votre commerce, votre temps, vos choix",
    description:
      "Pilotez clients, ventes, stocks, équipe, site web et boutique en ligne au même endroit. Essayez STUDIO OS gratuitement pendant 3 jours, puis 39 € TTC par mois sans engagement.",
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
  const demo = demoEnabled();
  return (
    <Landing
      demo={demo}
      demoHref={demo ? "/demo" : process.env.ATACUISINE_PUBLIC_DEMO_URL}
      account={await account()}
    />
  );
}
