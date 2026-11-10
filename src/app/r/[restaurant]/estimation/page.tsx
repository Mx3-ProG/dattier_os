import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, one } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { EstimationCalculator } from "@/components/estimation/calculator";
import type { PublicEstimationItem } from "@/features/estimation/model";
import "@/components/estimation/estimation.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estimation indicative" };
type Props = { params: Promise<{ restaurant: string }> };
export default async function Page({ params }: Props) {
  const { restaurant } = await params;
  const config = await withDatabaseContext({ restaurantId: restaurant, public: true }, async () =>
    (await getDb()).transaction(async (db) => {
      await db.exec("SET LOCAL ROLE atacuisine_app");
      return one<{ value: { title: string; introduction: string; items: PublicEstimationItem[] } | null }>(
        db, "SELECT app.estimation_public($1) AS value", [restaurant]);
    }),
  );
  if (!config.value) notFound();
  return <main className="estimation-shell">
    <nav><Link href={`/r/${encodeURIComponent(restaurant)}`}>← Retour au site</Link></nav>
    <section className="estimation-hero"><small>SIMULATEUR · SANS ENGAGEMENT</small>
      <h1>{config.value.title}</h1><p>{config.value.introduction}</p>
    </section>
    <EstimationCalculator items={config.value.items} />
  </main>;
}
