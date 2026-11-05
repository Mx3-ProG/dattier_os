"use client";
import { monthlyPrice, type Plan } from "@/features/platform/pricing";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import "./platform.css";
import "./access.css";
type Overview = {
  user: { name: string };
  organizations: {
    id: string;
    name: string;
    role: string;
    plan: Plan;
    seats: number;
    occupied: number;
    requested_plan: number;
  }[];
  restaurants: {
    id: string;
    name: string;
    organization_id: string;
    plan: Plan;
  }[];
};
export function PlatformHome() {
  const router = useRouter();
  const [data, setData] = useState<Overview>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [token, setToken] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/platform");
    if (r.status === 401) {
      router.push(
        `/connexion?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
      );
      return;
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || "Chargement impossible.");
    setData(d);
  }, [router]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const query = new URLSearchParams(location.search);
    setToken(query.get("invitation") || "");
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
      setToken("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const organization = data?.organizations.find((item) => item.id === selected);
  return (
    <main className="platform access-home">
      <nav className="access-nav" aria-label="Compte">
        <Link href="/" className="access-brand">atacuisine</Link>
        {data && <form action="/auth/logout" method="post"><button>Se déconnecter</button></form>}
      </nav>
      <header className="access-hero">
        <span className="access-label">Espace client</span>
        <h1>{data ? `Bonjour ${data.user.name}` : "Mes restaurants"}</h1>
        <p>Retrouvez vos établissements et reprenez votre service.</p>
        <Link href="/#offres">Voir les offres →</Link>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data ? (
        <>
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
          {data.organizations.map((o) => (
            <p key={o.id}>
              <strong>{o.name}</strong> ·{" "}
              {o.plan
                ? `Forfait à ${o.plan} € · ${monthlyPrice(o.plan, o.seats)} € HT / mois au total · ${o.occupied}/${o.seats} places utilisées`
                : `Forfait à ${o.requested_plan} € HT / mois en attente d’activation`}
            </p>
          ))}
          <div className="grid">
            {data.restaurants.map((r) => {
              const plan = r.plan;
              return (
                <article key={r.id}>
                  <h2>{r.name}</h2>
                  {plan !== 0 && (
                    <div className="actions">
                      <a
                        className="button"
                        href={`/dashboard?restaurant=${r.id}`}
                      >
                        Ouvrir le poste de travail
                      </a>
                      <a href={`/restaurant/${r.id}`}>Administrer</a>
                      {plan >= 69 && <a href={`/r/${r.id}`}>Voir le site</a>}
                      <a href={`/offline?restaurant=${r.id}`}>
                        Préparer le hors ligne
                      </a>
                    </div>
                  )}
                </article>
              );
            })}
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
                {organization &&
                  organization.occupied >= organization.seats && (
                    <p>
                      Demandez l’activation d’une place supplémentaire à 39 € HT
                      par mois.
                    </p>
                  )}
                <button
                  disabled={
                    busy ||
                    !organization?.plan ||
                    organization.occupied >= organization.seats
                  }
                >
                  Créer le restaurant
                </button>
              </form>
            </section>
          )}
          {data.organizations.length === 0 && !token && (
            <section>
              <h2>Ouvrez votre premier espace</h2>
              <p>Choisissez un forfait pour préparer votre organisation et votre premier restaurant.</p>
              <Link className="button" href="/#offres">Choisir une offre</Link>
            </section>
          )}
        </>
      ) : (
        <p role="status">Chargement de votre espace…</p>
      )}
    </main>
  );
}
