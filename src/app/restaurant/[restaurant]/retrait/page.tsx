import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { restaurantAdminContext } from "@/features/platform/admin-context";
import { PickupBoard } from "@/components/platform/pickup-board";
import "@/app/kiosk.css";

export const metadata: Metadata = { title: "Écran de retrait", robots: { index: false, follow: false } };

/** Écran de retrait (Click & Collect Premium), à afficher sur une télé au comptoir. */
export default async function Page({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;
  const access = await restaurantAdminContext(restaurant).catch(() => null);
  if (!access) notFound();
  return <PickupBoard restaurant={restaurant} name={access.restaurantName} />;
}
