import type { Metadata } from "next";
import { demoEnabled } from "@/infrastructure/database/db";
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
  return <GuidePage demo={demoEnabled()} />;
}
