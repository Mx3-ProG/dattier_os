import Link from "next/link";
import { SecurityCenter } from "@/components/security-center";
import "@/app/security.css";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  return (
    <main className="operations-security-page">
      <header>
        <Link href={`/restaurant/${restaurant}`}>
          ← Administration du restaurant
        </Link>
        <h1>Sécurité opérationnelle</h1>
      </header>
      <SecurityCenter restaurant={restaurant} />
    </main>
  );
}
