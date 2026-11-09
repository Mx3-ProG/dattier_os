import type { Metadata } from "next";
import { demoEnabled } from "@/lib/database/db";
import { Landing } from "@/components/landing";
import "./landing.css";
export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "STUDIO OS · Moins de gestion, plus de passion",
    description:
      "Retrouvez du temps pour votre restaurant et pour vous. Service, équipe, site web et STUDIO VOICE : un quotidien plus simple, dès 39 € HT par mois.",
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
