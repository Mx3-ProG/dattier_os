import type { Metadata } from "next";
import { demoLinks } from "@/infrastructure/database/demo-links";
import { GuidePage } from "@/components/guide-page";
import "../landing.css";
import "./guide.css";
import "../legal.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Guide d’utilisation · STUDIO S",
  description:
    "Toutes les fonctionnalités de STUDIO S expliquées de A à Z : clients, ventes, catalogue, stocks, équipe, fidélité, site web et outils adaptés à votre métier.",
};
export default function Page() {
  const { demoHref, demoSiteHref } = demoLinks();
  return <GuidePage demoHref={demoHref} demoSiteHref={demoSiteHref} />;
}
