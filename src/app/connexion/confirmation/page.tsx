import { BlackFridayBanner } from "@/components/auth/black-friday-banner";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { safeReturnTo } from "@/infrastructure/auth/oidc";
import { supabasePublicConfig } from "@/infrastructure/auth/supabase";
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
      <BlackFridayBanner />
      <nav className="access-nav" aria-label="Navigation principale">
        <Link href="/" className="access-brand"><Store size={22} /> STUDIO S</Link>
      </nav>
      <div className="access-split">
        <aside className="access-hero">
          <span className="access-label">Le bureau dans la poche</span>
          <p className="access-display">De la scène<br />aux coulisses.</p>
        </aside>
        <section className="access-panel">
          <AuthConfirmation config={config} returnTo={next} />
        </section>
      </div>
    </main>
  );
}
