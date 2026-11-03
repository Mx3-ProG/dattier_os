"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import "./platform.css";
type Overview = {
  user: { name: string };
  organizations: { id: string; name: string; role: string }[];
  restaurants: { id: string; name: string; organization_id: string }[];
};
export function PlatformHome() {
  const router = useRouter();
  const [data, setData] = useState<Overview>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [org, setOrg] = useState(""),
    [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [token, setToken] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/platform");
    if (r.status === 401) {
      router.push("/auth/login?returnTo=/platform");
      return;
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || "Chargement impossible.");
    setData(d);
  }, [router]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    setToken(new URLSearchParams(location.search).get("invitation") || "");
  }, [load]);
  async function submit(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Opération impossible.");
      await load();
      setName("");
      setOrg("");
      setToken("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform">
      <header>
        <span className="badge">Dattier OS · open source</span>
        <h1>Vos restaurants, au même endroit.</h1>
        <p>
          Commandes, équipes, stocks, sites et clients dans votre propre espace.
        </p>
        <div className="actions">
          <Link href="/">Site public</Link>
          <Link href="/demo">Démonstration locale</Link>
          <Link href="/source">Code source et licence</Link>
          {data && (
            <form action="/auth/logout" method="post">
              <button>Déconnexion</button>
            </form>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data ? (
        <>
          <h2>Bonjour {data.user.name}</h2>
          {token && (
            <section>
              <h2>Invitation à rejoindre une équipe</h2>
              <button
                disabled={busy}
                onClick={() => submit({ action: "accept", token })}
              >
                Accepter avec mon compte
              </button>
            </section>
          )}
          <div className="grid">
            {data.restaurants.map((r) => (
              <article key={r.id}>
                <h2>{r.name}</h2>
                <div className="actions">
                  <a className="button" href={`/dashboard?restaurant=${r.id}`}>
                    Ouvrir le poste de travail
                  </a>
                  <a href={`/restaurant/${r.id}`}>Administrer</a>
                  <a href={`/r/${r.id}`}>Voir le site</a>
                  <a href={`/offline?restaurant=${r.id}`}>
                    Préparer le hors ligne
                  </a>
                </div>
              </article>
            ))}
          </div>
          {data.organizations.some((o) =>
            ["OWNER", "ADMIN"].includes(o.role),
          ) && (
            <section>
              <h2>Ajouter un établissement</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit({
                    action: "restaurant",
                    organization: selected,
                    name,
                  });
                }}
              >
                <label>
                  Organisation
                  <select
                    required
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Choisir</option>
                    {data.organizations
                      .filter((o) => ["OWNER", "ADMIN"].includes(o.role))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Nom du restaurant
                  <input
                    required
                    minLength={2}
                    maxLength={150}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Créer le restaurant</button>
              </form>
            </section>
          )}
          <section>
            <h2>Créer votre organisation</h2>
            <p>
              Une organisation regroupe vos établissements et conserve son
              propre fichier client.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit({
                  action: "onboard",
                  organization: org,
                  restaurant: name,
                });
              }}
            >
              <label>
                Nom de l’organisation
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                />
              </label>
              <label>
                Premier restaurant
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button disabled={busy}>Créer mon espace</button>
            </form>
          </section>
        </>
      ) : (
        <p role="status">Chargement de votre espace…</p>
      )}
    </main>
  );
}
