import Link from "next/link";
import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { safeReturnTo } from "@/lib/auth/oidc";
import { supabasePublicConfig } from "@/lib/auth/supabase";
import { AuthConfirmation } from "@/components/auth/auth-confirmation";
import "../../landing.css";
import "@/components/platform/access.css";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  const config = supabasePublicConfig();
  if (!config) redirect("/connexion");
  const next = safeReturnTo(typeof returnTo === "string" ? returnTo : undefined);
  return (
    <main className="access-shell">
      <nav className="access-nav" aria-label="Navigation principale">
        <Link href="/" className="access-brand"><UtensilsCrossed size={22} /> STUDIO OS</Link>
      </nav>
      <div className="access-split">
        <aside className="access-hero">
          <span className="access-label">Le bureau du restaurant</span>
          <p className="access-display">De la salle<br />aux coulisses.</p>
        </aside>
        <section className="access-panel">
          <AuthConfirmation config={config} returnTo={next} />
        </section>
      </div>
    </main>
  );
}
