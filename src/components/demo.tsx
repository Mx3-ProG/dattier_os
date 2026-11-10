"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, UtensilsCrossed } from "lucide-react";
import type { Actor } from "@/lib/auth/session";
import { roleLabels } from "@/lib/permissions";
export function Demo({ returnTo = "/dashboard" }: { returnTo?: string }) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Actor[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const loadProfiles = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/v1/profiles")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data))
          throw new Error(data.error || "Profils indisponibles.");
        setProfiles(data);
        if (!data.length) setError("Aucun profil de démonstration n’est disponible.");
      })
      .catch(() => setError("La démo ne répond pas pour le moment. Réessayez dans quelques instants."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  async function login(id: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.push(returnTo);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="demo">
      <Link href="/" className="brand">
        <UtensilsCrossed /> STUDIO OS
      </Link>
      <div className="eyebrow">UN RESTAURANT. UNE ÉQUIPE. UN MÊME OUTIL.</div>
      <h1>Entrez dans les coulisses.</h1>
      <p>
        Choisissez un métier et vivez un service connecté.
        <br />
        Les profils partagent les mêmes données, conservées à chaque visite.
      </p>
      <p>Les add-ons payants sont ouverts à l’essai dans cette démo. Leurs prix restent visibles dans la boutique.</p>
      {loading && <p role="status">Chargement des profils de démonstration…</p>}
      {error && <div className="demo-error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={loadProfiles}><RefreshCw size={17} aria-hidden /> Réessayer</button>
      </div>}
      <div className="profile-grid">
        {profiles.map((p) => (
          <button
            disabled={busy}
            onClick={() => login(p.id)}
            key={p.id}
            className="profile-card"
          >
            <span className={`avatar role-${p.role}`}>
              {p.name.slice(0, 2)}
            </span>
            <div>
              <h2>{p.name}</h2>
              <p>{roleLabels[p.role]}</p>
            </div>
            <ArrowUpRight size={20} />
          </button>
        ))}
      </div>
      <small>
        Environnement de démonstration · Identités, tarifs et opérations
        fictifs.
        <br />
        Aucun paiement réel ni message externe envoyé.
      </small>
      <div className="demo-destinations" aria-label="Explorer la démonstration">
        <Link className="demo-destination" href="/site-demo">
          <span>Voir le site web de la démo</span>
          <ArrowUpRight size={18} aria-hidden />
        </Link>
        <Link className="demo-destination" href="/guide">
          <span>Lire le guide d’utilisation</span>
          <ArrowUpRight size={18} aria-hidden />
        </Link>
      </div>
    </main>
  );
}
