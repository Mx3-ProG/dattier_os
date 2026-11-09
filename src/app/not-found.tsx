import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, LogIn } from "lucide-react";
import { UtensilsMark } from "@/components/brand/utensils";
import { actor } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Page introuvable · STUDIO OS",
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
          <UtensilsMark size={18} /> STUDIO OS
        </Link>
        <div className="dattier-404-code" aria-hidden>
          4
          <span className="dattier-404-plate">
            <UtensilsMark />
          </span>
          4
        </div>
        <h1>Cette table n’existe pas</h1>
        <p>
          La page que vous cherchez a été débarrassée, déplacée ou n’a jamais
          été dressée. Revenez en salle, on vous attend.
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
