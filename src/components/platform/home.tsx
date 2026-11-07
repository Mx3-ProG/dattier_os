"use client";
import { UtensilsLoader } from "@/components/brand/utensils";
import { type Plan } from "@/features/platform/pricing";
import { referralPricing, type PaidPlan } from "@/features/platform/referrals";
import { AccountWorkspace } from "./account-workspace";
import { ReferralPanel } from "./referral-panel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowUpRight, Building2, Plus } from "lucide-react";
import { can, type Role } from "@/lib/permissions";
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
    paid_plan: Plan;
    referral_code: string | null;
    paying_referrals: number | null;
    activated_total: number | null;
    credits: number | null;
  }[];
  restaurants: {
    id: string;
    name: string;
    organization_id: string;
    plan: Plan;
    user_roles: Role[];
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
  const canCreate = !!data?.organizations.some((o) =>
    ["OWNER", "ADMIN"].includes(o.role),
  );
  return (
    <AccountWorkspace
      name={data?.user.name}
      restaurants={data?.restaurants || []}
      canCreate={canCreate}
    >
      <main className="platform restaurant-workspace-content account-home-content">
        <header className="account-page-heading">
          <div>
            <span className="account-eyebrow">VOTRE ESPACE DE GESTION</span>
            <h1>{data ? `Bonjour ${data.user.name}.` : "Mes restaurants"}</h1>
            <p>Vos établissements, votre équipe, votre quotidien.</p>
          </div>
          {canCreate && (
            <a className="button" href="#ajouter-etablissement">
              <Plus size={16} />
              Ajouter un établissement
            </a>
          )}
        </header>
        {data && (
          <div className="account-overview">
            <div>
              <Building2 size={22} />
              <span>
                <strong>{data.restaurants.length}</strong> établissement
                {data.restaurants.length > 1 ? "s" : ""}
              </span>
            </div>
            <p>
              Choisissez votre restaurant pour retrouver votre poste de travail
              et ses réglages.
            </p>
          </div>
        )}
        {error && data && (
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
            <div className="grid account-restaurants">
              {data.restaurants.map((r) => {
                const plan = r.plan;
                return (
                  <article key={r.id} className="account-restaurant-card">
                    <div className="account-restaurant-identity">
                      <span className="account-restaurant-icon">
                        <Building2 size={24} />
                      </span>
                      <span className="account-plan">
                        {plan ? "Espace actif" : "En attente d’activation"}
                      </span>
                    </div>
                    <h2>{r.name}</h2>
                    <p>Votre service et votre administration, réunis.</p>
                    {plan !== 0 && (
                      <div className="actions">
                        <a
                          className="button"
                          href={`/dashboard?restaurant=${r.id}`}
                        >
                          Ouvrir le poste de travail <ArrowUpRight size={16} />
                        </a>
                        <a href={`/restaurant/${r.id}`}>Administrer</a>
                        {plan >= 69 && <a href={`/r/${r.id}`}>Voir le site</a>}
                        {can(r.user_roles, "orders") && (
                          <a href={`/offline?restaurant=${r.id}`}>
                            Préparer le hors ligne
                          </a>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {data.organizations.map((o) => {
              const paying = o.paying_referrals ?? 0;
              const price = referralPricing(o.paid_plan, o.seats, paying);
              return (
                <div key={o.id}>
                  <article className="organization-summary">
                    <div>
                      <span className="access-label">Organisation</span>
                      <strong>{o.name}</strong>
                    </div>
                    <p>
                      {o.paid_plan
                        ? [
                            `Forfait ${o.paid_plan} €${price.free ? " offert" : ""}`,
                            price.accessPlan > o.paid_plan &&
                              `accès ${price.accessPlan} € débloqué`,
                            `${price.total} € HT / mois`,
                            `${o.occupied}/${o.seats} places utilisées`,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : `Forfait ${o.requested_plan} € HT / mois en attente d’activation`}
                    </p>
                  </article>
                  {o.paid_plan > 0 && o.referral_code && (
                    <ReferralPanel
                      organization={o.id}
                      code={o.referral_code}
                      plan={o.paid_plan as PaidPlan}
                      seats={o.seats}
                      paying={paying}
                      activated={o.activated_total ?? 0}
                      credits={o.credits ?? 0}
                    />
                  )}
                </div>
              );
            })}
            {data.organizations.some((o) =>
              ["OWNER", "ADMIN"].includes(o.role),
            ) && (
              <section
                id="ajouter-etablissement"
                className="add-restaurant-panel"
              >
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
                        Demandez l’activation d’une place supplémentaire à 39 €
                        HT par mois.
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
                <p>
                  Choisissez un forfait pour préparer votre organisation et
                  votre premier restaurant.
                </p>
                <Link className="button" href="/#offres">
                  Choisir une offre
                </Link>
              </section>
            )}
          </>
        ) : error ? (
          <section className="platform-empty-state" role="alert">
            <h2>Votre espace n’a pas pu être chargé</h2>
            <p>{error}</p>
            <div className="actions">
              <button
                onClick={() => void load().catch((e) => setError(e.message))}
              >
                Réessayer
              </button>
              <Link href="/connexion">Se reconnecter</Link>
            </div>
          </section>
        ) : (
          <UtensilsLoader
            label="Chargement de votre espace"
            fullscreen={false}
          />
        )}
      </main>
    </AccountWorkspace>
  );
}
