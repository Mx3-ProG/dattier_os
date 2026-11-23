import { BlackFridayBanner } from "@/components/auth/black-friday-banner";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { oidcConfigured, safeReturnTo } from "@/infrastructure/auth/oidc";
import { supabasePublicConfig } from "@/infrastructure/auth/supabase";
import { PasswordAuth } from "@/components/auth/password-auth";
import { actor } from "@/infrastructure/auth/session";
import { demoEnabled } from "@/infrastructure/database/db";
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
      <BlackFridayBanner />
      <nav className="access-nav" aria-label="Navigation principale">
        <Link href="/" className="access-brand"><Store size={22} /> STUDIO S</Link>
        <Link href="/#offres">Voir les offres</Link>
      </nav>
      <div className="access-split">
        <aside className="access-hero">
          <span className="access-label">Le bureau dans la poche</span>
          <p className="access-display">De la scène<br />aux coulisses.</p>
          <p>Un espace pour retrouver votre équipe, vos établissements et le fil de votre activité.</p>
        </aside>
        <section className="access-panel">
          {supabase ? (
            <PasswordAuth config={supabase} returnTo={next} initialMode={register ? "register" : "login"} />
          ) : (<>
          <span className="access-label">Espace client</span>
          <h1>{register ? "Créer votre compte" : "Heureux de vous revoir."}</h1>
          <p>{register ? "Inscrivez-vous avec votre adresse e-mail pour ouvrir votre espace." : "Connectez-vous pour retrouver votre espace STUDIO S."}</p>
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
