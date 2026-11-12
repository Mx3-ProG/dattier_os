"use client";
import { UtensilsLoader } from "@/components/brand/utensils";
import { type Plan } from "@/features/platform/pricing";
import { referralPricing, type PaidPlan } from "@/features/platform/referrals";
import { AccountWorkspace } from "./account-workspace";
import { BillingAccount } from "./billing-account";
import { ReferralPanel } from "./referral-panel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowUpRight, Building2, Plus } from "lucide-react";
import { can, type Role } from "@/core/permissions";
import { industries, industryLabels, trades, discoveryLabels, type Industry } from "@/features/onboarding/catalog";
import "./platform.css";
import "./access.css";
type Overview = {
  user: { id: string; name: string };
  platformAdmin?: boolean;
  billingReady?: boolean;
  organizations: {
    id: string;
    name: string;
    role: string;
    plan: Plan;
    seats: number;
    occupied: number;
    requested_plan: number;
    paid_plan: Plan;
    trial_ends_at: string | null;
    trial_active: boolean;
    cancelled_at: string | null;
    referral_code: string | null;
    paying_referrals: number | null;
    activated_total: number | null;
    credits: number | null;
    discovery_source?: string;
    discovery_detail?: string;
    onboarding_answers?: { teamSize?: string; mainChallenge?: string };
    creator_name?: string;
    creator_email?: string;
    creator_job_title?: string;
    creator_work_phone?: string;
    billing_status?: string;
    billing_period_end?: string | null;
    billing_cancelling?: boolean;
    billing_customer?: boolean;
  }[];
  restaurants: {
    id: string;
    name: string;
    organization_id: string;
    plan: Plan;
    user_roles: Role[];
    industry?: Industry;
    trade?: string;
  }[];
};
export function PlatformHome() {
  const router = useRouter();
  const [data, setData] = useState<Overview>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [industry, setIndustry] = useState<Industry>("restaurant"),
    [trade, setTrade] = useState("Restaurant"),
    [tradeDetail, setTradeDetail] = useState(""),
    [token, setToken] = useState(""),
    [notice, setNotice] = useState("");
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
    const outcome = query.get("abonnement");
    if (outcome)
      setNotice(
        outcome === "ok"
          ? "Merci ! Votre abonnement Studio est actif."
          : outcome === "annule"
            ? "Paiement annulé : aucun montant n’a été prélevé."
            : "Paiement reçu, activation en cours. Actualisez la page dans quelques instants.",
      );
  }, [load]);
  async function billing(action: "checkout" | "portal", organization: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/platform/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, organization }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error?.message || "Paiement indisponible pour le moment.");
      window.location.assign(d.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
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
      userId={data?.user.id}
      name={data?.user.name}
      restaurants={data?.restaurants || []}
      canCreate={canCreate}
      platformAdmin={data?.platformAdmin}
    >
      <main className="platform restaurant-workspace-content account-home-content">
        <header className="account-page-heading">
          <div>
            <span className="account-eyebrow">VOTRE ESPACE DE GESTION</span>
            <h1>{data ? `Bonjour ${data.user.name}.` : "Mes établissements"}</h1>
            <p>Vos établissements, votre équipe, votre quotidien.</p>
          </div>
          {canCreate && (
            <a className="button" href="#ajouter-etablissement">
              <Plus size={16} />
              Ajouter un établissement
            </a>
          )}
        </header>
        {data && data.restaurants.length > 0 && (
          <div className="account-overview">
            <div>
              <Building2 size={22} />
              <span>
                <strong>{data.restaurants.length}</strong> établissement
                {data.restaurants.length > 1 ? "s" : ""}
              </span>
            </div>
            <p>
              Choisissez votre établissement pour retrouver votre poste de travail
              et ses réglages.
            </p>
          </div>
        )}
        {notice && <p role="status" className="notice">{notice}</p>}
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
                        {plan ? "Espace actif" : "Accès à activer"}
                      </span>
                    </div>
                    <h2>{r.name}</h2>
                    {r.trade && <p>{r.trade}</p>}
                    <p>Votre activité et votre administration, réunies.</p>
                    {plan !== 0 && (
                      <div className="actions">
                        <a
                          className="button"
                          href={`/dashboard?restaurant=${r.id}`}
                        >
                          Ouvrir le poste de travail <ArrowUpRight size={16} />
                        </a>
                        <a href={`/restaurant/${r.id}`}>Administrer</a>
                        {plan >= 39 && <a href={`/r/${r.id}`}>Voir le site</a>}
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
            <section id="abonnements"><h2>Abonnements et achats</h2>
              <p>Vos échéances, factures, add-ons et recharges, organisation par organisation.</p>
              {data.organizations.filter(o=>o.role==="OWNER").map(o=><BillingAccount key={o.id} organization={o.id} name={o.name} onChanged={load}/>)}
              {!data.organizations.some(o=>o.role==="OWNER")&&<p>La facturation est réservée au propriétaire de chaque organisation.</p>}
            </section>
            {data.organizations.map((o) => {
              const paying = o.paying_referrals ?? 0;
              const price = referralPricing(o.paid_plan, o.seats, paying);
              const trialActive = o.trial_active;
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
                            `Abonnement Studio ${o.paid_plan} €${price.free ? " offert" : ""}`,
                            `${price.total} € TTC / mois`,
                            `${o.occupied}/${o.seats} places utilisées`,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : trialActive
                          ? `Essai gratuit jusqu’au ${new Date(o.trial_ends_at!).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" })} · aucun paiement prélevé`
                          : o.cancelled_at
                            ? "Abonnement résilié · accès fermé"
                            : "Essai terminé · abonnement en attente d’activation"}
                    </p>
                    {["OWNER","ADMIN"].includes(o.role) && o.discovery_source && <div>
                      <p>Créé par {o.creator_name || "le propriétaire"}{o.creator_job_title ? " · " + o.creator_job_title : ""}{o.creator_work_phone ? " · " + o.creator_work_phone : ""}</p>
                      <p>Découverte de Studio OS : {discoveryLabels[o.discovery_source as keyof typeof discoveryLabels] || o.discovery_source}{o.discovery_detail ? " · " + o.discovery_detail : ""}</p>
                      {o.onboarding_answers?.mainChallenge && <p>Priorité déclarée : {o.onboarding_answers.mainChallenge}</p>}
                    </div>}
                    {o.billing_status && ["active", "trialing", "past_due"].includes(o.billing_status) && (
                      <p>
                        {o.billing_status === "past_due"
                          ? "Paiement en échec : mettez à jour votre moyen de paiement."
                          : o.billing_cancelling
                            ? `Renouvellement arrêté · accès jusqu’au ${o.billing_period_end ? new Date(o.billing_period_end).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }) : "terme de la période"}`
                            : o.billing_status === "trialing"
                              ? "Abonnement enregistré · premier prélèvement à la fin de l’essai"
                              : `Abonnement mensuel actif${o.billing_period_end ? ` · prochain renouvellement le ${new Date(o.billing_period_end).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })}` : ""}`}
                      </p>
                    )}
                    {data.billingReady && o.role === "OWNER" && !o.paid_plan && !["active", "trialing", "past_due"].includes(o.billing_status || "") && (
                      <button type="button" className="access-primary" disabled={busy} onClick={() => void billing("checkout", o.id)}>
                        {o.trial_active ? "Activer mon abonnement · 39 € TTC / mois" : "S’abonner · 39 € TTC / mois"}
                      </button>
                    )}
                    {data.billingReady && o.role === "OWNER" && o.billing_customer && (
                      <button type="button" disabled={busy} onClick={() => void billing("portal", o.id)}>
                        Gérer mon abonnement
                      </button>
                    )}
                    {(trialActive || o.paid_plan > 0) && o.role === "OWNER" && !o.billing_cancelling && !(o.billing_customer && ["active", "trialing", "past_due"].includes(o.billing_status || "")) && (
                      <button type="button" disabled={busy} onClick={() => {
                        if (window.confirm("Résilier maintenant ? L’accès à cet espace sera fermé immédiatement."))
                          void submit({ action: "cancelSubscription", organization: o.id });
                      }}>
                        {trialActive ? "Arrêter mon essai" : "Résilier mon abonnement"}
                      </button>
                    )}
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
                      activity: { industry, trade, tradeDetail },
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
                    Nom de l’établissement
                    <input
                      required
                      minLength={2}
                      maxLength={150}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>Famille d’activité
                    <select value={industry} onChange={(e) => {
                      const next=e.target.value as Industry;
                      setIndustry(next);setTrade(trades[next][0]);setTradeDetail("");
                    }}>{industries.map((item)=><option key={item} value={item}>{industryLabels[item]}</option>)}</select>
                  </label>
                  <label>Métier
                    <select value={trade} onChange={(e)=>setTrade(e.target.value)}>{trades[industry].map((item)=><option key={item}>{item}</option>)}</select>
                  </label>
                  {trade.startsWith("Autre") && <label>Précisez votre activité
                    <input required value={tradeDetail} onChange={(e)=>setTradeDetail(e.target.value)} />
                  </label>}
                  {organization &&
                    organization.occupied >= organization.seats && (
                      <p>
                        Votre capacité est atteinte. <a href="#abonnements">Ajouter une place à votre abonnement</a> (39 € TTC par mois).
                      </p>
                    )}
                  <button
                    disabled={
                      busy ||
                      !organization?.plan ||
                      organization.occupied >= organization.seats
                    }
                  >
                    Créer l’établissement
                  </button>
                </form>
              </section>
            )}
            {data.organizations.length === 0 && !token && (
              <section className="first-establishment">
                <span className="account-eyebrow">BIENVENUE</span>
                <h2>Créez votre premier établissement</h2>
                <p>
                  Votre compte est prêt. En quelques questions, décrivez votre
                  structure et votre activité : votre tableau de bord s’ouvre
                  ensuite avec les outils adaptés à votre métier.
                </p>
                <ol>
                  <li>Votre profil et votre structure</li>
                  <li>Votre métier et votre quotidien</li>
                  <li>Votre espace activé, avec 7 jours d’essai gratuits et toutes les fonctionnalités</li>
                </ol>
                <Link className="button" href="/checkout/39">
                  <Plus size={16} />
                  Créer mon premier établissement
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
