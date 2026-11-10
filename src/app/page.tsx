import type { Metadata } from "next";
import { demoEnabled } from "@/lib/database/db";
import { Landing } from "@/components/landing";
import "./landing.css";
export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "STUDIO OS · Votre commerce, votre temps, vos choix",
    description:
      "Pilotez clients, ventes, stocks, équipe, site web et boutique en ligne au même endroit. Essayez STUDIO OS gratuitement pendant 3 jours, puis 39 € TTC par mois sans engagement.",
    robots: { index: !demoEnabled(), follow: !demoEnabled() },
  };
}
export default function Page() {
  const demo = demoEnabled();
  return (
    <Landing
      demo={demo}
      demoHref={demo ? "/demo" : process.env.ATACUISINE_PUBLIC_DEMO_URL}
    />
  );
}
