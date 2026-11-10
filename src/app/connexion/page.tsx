import Link from "next/link";
import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { oidcConfigured, safeReturnTo } from "@/lib/auth/oidc";
import { supabasePublicConfig } from "@/lib/auth/supabase";
import { PasswordAuth } from "@/components/auth/password-auth";
import { actor } from "@/lib/auth/session";
import { demoEnabled } from "@/lib/database/db";
import { Demo } from "@/components/demo";
import "../landing.css";
import "@/components/platform/access.css";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ returnTo?: string; mode?: string }>;
}) {
  const { returnTo, mode } = await searchParams;
  const next = safeReturnTo(typeof returnTo === "string" ? returnTo : undefined);
  if (await actor().catch(() => null)) redirect(next === "/connexion" ? "/platform" : next);
  if (demoEnabled()) return <Demo returnTo={next} />;
  const register = mode === "register";
  const supabase = oidcConfigured() ? null : supabasePublicConfig();
  const query = new URLSearchParams({ returnTo: next });
  const switchMode = `/connexion?${query}${register ? "" : "&mode=register"}`;
  if (register) query.set("mode", "register");
  return (
    <main className="access-shell">
      <nav className="access-nav" aria-label="Navigation principale">
        <Link href="/" className="access-brand"><UtensilsCrossed size={22} /> STUDIO OS</Link>
        <Link href="/#offres">Voir les offres</Link>
      </nav>
      <div className="access-split">
        <aside className="access-hero">
          <span className="access-label">Le bureau du restaurant</span>
          <p className="access-display">De la salle<br />aux coulisses.</p>
          <p>Un espace pour retrouver vos équipes, vos établissements et le fil du service.</p>
        </aside>
        <section className="access-panel">
          {supabase ? (
            <PasswordAuth config={supabase} returnTo={next} initialMode={register ? "register" : "login"} />
          ) : (<>
          <span className="access-label">Espace client</span>
          <h1>{register ? "Créer votre compte" : "Heureux de vous revoir."}</h1>
          <p>{register ? "Inscrivez-vous avec votre adresse e-mail pour ouvrir votre espace." : "Connectez-vous pour retrouver votre espace STUDIO OS."}</p>
          <a className="access-primary" href={`/auth/login?${query}`}>
            {register ? "Continuer vers l’inscription" : "Se connecter"}
          </a>
          <p>{register ? "Déjà un compte ?" : "Première visite ?"}{" "}
            <Link href={switchMode}>{register ? "Se connecter" : "Créer un compte"}</Link>
          </p>
          </>)}
        </section>
      </div>
    </main>
  );
}
