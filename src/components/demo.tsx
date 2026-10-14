"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, UtensilsCrossed } from "lucide-react";
import type { Actor } from "@/lib/auth/session";
import { roleLabels } from "@/lib/permissions";
export function Demo() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Actor[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/v1/profiles")
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setProfiles(d) : setError(d.error)))
      .catch(() => setError("Serveur indisponible."));
  }, []);
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
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="demo">
      <Link href="/" className="brand">
        <UtensilsCrossed /> DATTIER <span>OS</span>
      </Link>
      <div className="eyebrow">UN RESTAURANT. UNE ÉQUIPE. UN MÊME OUTIL.</div>
      <h1>Entrez dans les coulisses.</h1>
      <p>
        Choisissez un métier et vivez un service connecté.
        <br />
        Les profils partagent les mêmes données, conservées à chaque visite.
      </p>
      <div role="alert">{error}</div>
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
        Environnement local de démonstration · Identités, tarifs et opérations
        fictifs.
        <br />
        Aucun paiement réel ni message externe envoyé.
      </small>
      <Link href="/">Découvrir le site du restaurant →</Link>
    </main>
  );
}
