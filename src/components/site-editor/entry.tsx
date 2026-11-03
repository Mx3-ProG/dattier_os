"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteEditor } from "./index";
import { TenantSiteProvider } from "../cms-site/context";
export function WebsiteStudio({
  restaurant,
  demo,
}: {
  restaurant: string;
  demo: boolean;
}) {
  const router = useRouter();
  return (
    <TenantSiteProvider restaurant={restaurant} demo={demo}>
      <main className="website-studio">
        <header className="studio-heading">
          <Link href={`/restaurant/${restaurant}`}>
            ← Administration du restaurant
          </Link>
          <h1>Mon site web</h1>
          {demo && (
            <p>
              Démonstration locale · modifications propres à cet établissement.
            </p>
          )}
        </header>
        <SiteEditor navigate={() => router.push(`/restaurant/${restaurant}`)} />
      </main>
    </TenantSiteProvider>
  );
}
