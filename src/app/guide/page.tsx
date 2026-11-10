import type { Metadata } from "next";
import { demoEnabled } from "@/lib/database/db";
import { GuidePage } from "@/components/guide-page";
import "../landing.css";
import "./guide.css";
import "../legal.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Guide d’utilisation · STUDIO OS",
  description:
    "Toutes les fonctionnalités de STUDIO OS expliquées de A à Z : commandes, cuisine, règlement, carte, stocks, réservations, fidélité, site web et paiement client.",
};
export default function Page() {
  return <GuidePage demo={demoEnabled()} />;
}
