"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe } from "lucide-react";
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
          <Link
            className="studio-back"
            href={`/restaurant/${restaurant}`}
            aria-label="Retour à l’administration du restaurant"
          >
            <ArrowLeft size={18} />
            <span>Administration</span>
          </Link>
          <div className="studio-brand">
            <svg viewBox="0 0 64 64" width={36} height={36} aria-hidden="true">
              <rect width="64" height="64" rx="18" fill="#344d3e" />
              <path
                d="M20 45C12 18 41 18 48 12C49 35 35 48 20 45ZM20 45L40 24"
                fill="none"
                stroke="#f1ddbb"
                strokeWidth="3"
              />
            </svg>
            <div>
              <span className="studio-kicker">Dattier OS · Studio</span>
              <h1>Mon site web</h1>
            </div>
          </div>
          <div className="studio-meta">
            {demo && <span className="studio-pill">Démonstration</span>}
            <a
              className="studio-visit"
              href={`/r/${encodeURIComponent(restaurant)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Globe size={16} />
              <span>Voir le site en ligne</span>
            </a>
          </div>
        </header>
        <SiteEditor navigate={() => router.push(`/restaurant/${restaurant}`)} />
      </main>
    </TenantSiteProvider>
  );
}
