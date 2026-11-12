import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, LogIn } from "lucide-react";
import { Store } from "lucide-react";
import { actor } from "@/infrastructure/auth/session";

export const metadata: Metadata = {
  title: "Page introuvable · STUDIO S",
  robots: { index: false, follow: false },
};

/** Connecté : retour direct au tableau de bord. Sinon : vers la connexion. */
async function signedIn() {
  try {
    await actor();
    return true;
  } catch {
    return false;
  }
}

export default async function NotFound() {
  const connected = await signedIn();
  return (
    <main className="dattier-404">
      <div className="dattier-404-card">
        <Link href="/" className="dattier-404-brand">
          <Store size={18} /> STUDIO S
        </Link>
        <div className="dattier-404-code" aria-hidden>
          4
          <span className="dattier-404-plate">
            <Store />
          </span>
          4
        </div>
        <h1>Cette page n’existe pas</h1>
        <p>
          La page que vous cherchez a été retirée, déplacée ou n’a jamais
          existé. Revenez à l’accueil, on vous attend.
        </p>
        <div className="dattier-404-actions">
          {connected ? (
            <Link className="dattier-404-btn primary" href="/platform">
              <LayoutDashboard size={18} aria-hidden /> Retour au tableau de
              bord
            </Link>
          ) : (
            // Même entrée que « Se connecter » sur l'accueil : /platform renvoie
            // vers le fournisseur d'identité ou la connexion de démonstration.
            <Link className="dattier-404-btn primary" href="/platform">
              <LogIn size={18} aria-hidden /> Se connecter
            </Link>
          )}
          <Link className="dattier-404-btn ghost" href="/">
            <ArrowLeft size={18} aria-hidden /> Page d’accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
