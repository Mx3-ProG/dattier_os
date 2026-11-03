import Link from "next/link";
import { SeoDashboard } from "@/components/platform/seo-dashboard";
import "@/components/platform/platform.css";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  return (
    <main className="platform">
      <header>
        <Link href={`/restaurant/${restaurant}`}>
          ← Administration du restaurant
        </Link>
        <h1>SEO & visibilité IA</h1>
      </header>
      <SeoDashboard restaurant={restaurant} />
    </main>
  );
}
