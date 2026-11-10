"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { industries, industryLabels, trades, discoverySources, discoveryLabels, workflowChoices, workflowLabels, relevantCapabilities, type Industry } from "@/features/onboarding/catalog";
import "./onboarding.css";

type Draft = {
  step?: number;
  requestKey: string; organization: string; restaurant: string;
  professional: { jobTitle: string; phone: string };
  activity: { industry: Industry; trade: string; tradeDetail: string };
  answers: { teamSize: string; workflows: string[]; currentTools: string; mainChallenge: string };
  discovery: { source: string; detail: string };
};
const fresh = (): Draft => ({
  step: 0, requestKey: crypto.randomUUID(), organization: "", restaurant: "",
  professional: { jobTitle: "", phone: "" },
  activity: { industry: "restaurant", trade: "Restaurant", tradeDetail: "" },
  answers: { teamSize: "solo", workflows: [], currentTools: "", mainChallenge: "" },
  discovery: { source: "", detail: "" },
});
const steps = ["Votre profil", "Votre structure", "Votre métier", "Votre quotidien", "Découverte", "Vérification"];
const invitationRoles: Record<Industry, { id: string; label: string }[]> = {
  restaurant: [{ id: "MANAGER", label: "Responsable" }, { id: "WAITER", label: "Salle" }, { id: "CHEF", label: "Cuisine" }, { id: "BARTENDER", label: "Bar" }],
  beauty: [{ id: "MANAGER", label: "Responsable" }, { id: "WAITER", label: "Collaborateur" }],
  retail: [{ id: "MANAGER", label: "Responsable" }, { id: "WAITER", label: "Collaborateur" }],
  construction: [{ id: "MANAGER", label: "Responsable" }, { id: "WAITER", label: "Collaborateur" }],
  services: [{ id: "MANAGER", label: "Responsable" }, { id: "WAITER", label: "Collaborateur" }],
  other: [{ id: "MANAGER", label: "Responsable" }, { id: "WAITER", label: "Collaborateur" }],
};

export function SubscriptionForm({ plan, userName, userEmail }: { plan: number; userName: string; userEmail?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MANAGER");
  const [inviteLink, setInviteLink] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/platform").then((r) => r.json()).then((data) => {
      if (active) {
        const saved=data.draft?.requestKey ? data.draft as Draft : fresh();
        setDraft(saved);
        setStep(Math.max(0,Math.min(steps.length-1,Number(saved.step)||0)));
      }
    }).catch(() => { if (active) setDraft(fresh()); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!draft || created) return;
    const timer = setTimeout(() => {
      void fetch("/api/platform/onboarding-draft", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, created]);
  const change = (part: Partial<Draft>) => setDraft((d) => d ? { ...d, ...part } : d);
  const validation = () => {
    if (!draft) return false;
    const message = step === 0 && draft.professional.jobTitle.trim().length < 2 ? "Indiquez votre fonction."
      : step === 1 && (draft.organization.trim().length < 2 || draft.restaurant.trim().length < 2) ? "Indiquez les noms de votre organisation et de votre établissement."
      : step === 2 && !trades[draft.activity.industry].includes(draft.activity.trade) ? "Choisissez un métier dans la liste."
      : step === 2 && draft.activity.trade.startsWith("Autre") && !draft.activity.tradeDetail.trim() ? "Précisez votre activité."
      : step === 3 && draft.answers.mainChallenge.trim().length < 2 ? "Indiquez votre principal besoin."
      : step === 4 && (!draft.discovery.source || draft.discovery.source === "other" && !draft.discovery.detail.trim()) ? "Indiquez comment vous avez découvert Studio OS."
      : "";
    setError(message); return !message;
  };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    if (step < steps.length - 1) { if (validation()) { setStep(step + 1); change({step:step+1}); } return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "onboard", plan, ...draft }),
      });
      if (response.status === 401) { router.replace("/connexion?returnTo=" + encodeURIComponent(location.pathname)); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Création impossible.");
      setCreated(body.restaurant);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Service indisponible."); }
    finally { setBusy(false); }
  }
  async function invite(event: FormEvent) {
    event.preventDefault(); if (!created) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", restaurant: created, email: inviteEmail, roles: [inviteRole] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Invitation impossible.");
      setInviteLink(location.origin + "/platform?invitation=" + body.token);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation impossible."); }
    finally { setBusy(false); }
  }
  if (!draft) return <p>Chargement de votre parcours…</p>;
  if (created) return <section className="onboarding-form" role="status">
    <h2>Votre espace est prêt</h2>
    <p>Votre essai gratuit de trois jours a commencé. L’équipe et les clients peuvent être ajoutés maintenant ou plus tard.</p>
    <form onSubmit={invite} className="onboarding-fields"><h3>Inviter un collaborateur</h3>
      <label>E-mail<input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></label>
      <label>Rôle<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>{invitationRoles[draft.activity.industry].map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
      <button disabled={busy}>Créer un lien d’invitation</button>
    </form>
    {inviteLink && <p>Lien à transmettre : <a href={inviteLink}>{inviteLink}</a> <button type="button" onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copier</button></p>}
    <div className="onboarding-actions">
      <Link href={"/restaurant/" + created + "/import-clients"}>Importer mes clients</Link>
      <Link className="access-primary" href={"/dashboard?restaurant=" + created}>Ouvrir mon espace</Link>
    </div>{error && <p role="alert">{error}</p>}
  </section>;
  const activity = draft.activity;
  const capabilities = relevantCapabilities(activity.industry,draft.answers.workflows);
  return <form className="onboarding-form" onSubmit={submit}>
    <div className="onboarding-progress"><small>Étape {step + 1} sur {steps.length}</small><div role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={steps.length}><span style={{ width: ((step + 1) / steps.length * 100) + "%" }} /></div><strong>{steps[step]}</strong></div>
    {step === 0 && <div className="onboarding-fields"><p>Ces coordonnées identifient le créateur de l’organisation.</p><label>Nom du compte<input readOnly value={userName} /></label><label>E-mail vérifié<input readOnly value={userEmail || "E-mail vérifié"} /></label><label>Votre fonction<input required minLength={2} value={draft.professional.jobTitle} onChange={(e) => change({ professional: { ...draft.professional, jobTitle: e.target.value } })} placeholder="Gérant, fondatrice, responsable…" /></label><label>Téléphone professionnel (facultatif)<input type="tel" value={draft.professional.phone} onChange={(e) => change({ professional: { ...draft.professional, phone: e.target.value } })} /></label></div>}
    {step === 1 && <div className="onboarding-fields"><p>Votre organisation regroupe vos établissements. Chacun garde ses propres données et son équipe.</p><label>Nom de l’organisation<input required minLength={2} maxLength={150} value={draft.organization} onChange={(e) => change({ organization: e.target.value })} /></label><label>Nom du premier établissement<input required minLength={2} maxLength={150} value={draft.restaurant} onChange={(e) => change({ restaurant: e.target.value })} /></label></div>}
    {step === 2 && <div className="onboarding-fields"><label>Famille d’activité<select value={activity.industry} onChange={(e) => { const industry = e.target.value as Industry; change({ activity: { industry, trade: trades[industry][0], tradeDetail: "" } }); }}>{industries.map((industry) => <option value={industry} key={industry}>{industryLabels[industry]}</option>)}</select></label><label>Métier précis (recherchable)<input list="studio-trades" value={activity.trade} onChange={(e) => change({ activity: { ...activity, trade: e.target.value } })} /><datalist id="studio-trades">{trades[activity.industry].map((trade) => <option key={trade} value={trade} />)}</datalist></label>{activity.trade.startsWith("Autre") && <label>Décrivez votre métier<input required value={activity.tradeDetail} onChange={(e) => change({ activity: { ...activity, tradeDetail: e.target.value } })} /></label>}</div>}
    {step === 3 && <div className="onboarding-fields"><label>Taille de l’équipe<select value={draft.answers.teamSize} onChange={(e) => change({ answers: { ...draft.answers, teamSize: e.target.value } })}><option value="solo">Je travaille seul</option><option value="2-5">2 à 5 personnes</option><option value="6-20">6 à 20 personnes</option><option value="21+">Plus de 20 personnes</option></select></label><fieldset><legend>Que gérez-vous au quotidien ?</legend>{workflowChoices.map((item) => <label className="onboarding-check" key={item}><input type="checkbox" checked={draft.answers.workflows.includes(item)} onChange={(e) => change({ answers: { ...draft.answers, workflows: e.target.checked ? [...draft.answers.workflows,item] : draft.answers.workflows.filter((x) => x !== item) } })} />{workflowLabels[item]}</label>)}</fieldset><label>Logiciel actuel (facultatif)<input value={draft.answers.currentTools} onChange={(e) => change({ answers: { ...draft.answers, currentTools: e.target.value } })} /></label><label>Votre principal besoin<textarea required value={draft.answers.mainChallenge} onChange={(e) => change({ answers: { ...draft.answers, mainChallenge: e.target.value } })} placeholder="Qu’aimeriez-vous simplifier ?" /></label></div>}
    {step === 4 && <div className="onboarding-fields"><label>Comment avez-vous découvert Studio OS ?<select required value={draft.discovery.source} onChange={(e) => change({ discovery: { ...draft.discovery, source: e.target.value } })}><option value="">Choisir</option>{discoverySources.map((source) => <option key={source} value={source}>{discoveryLabels[source]}</option>)}</select></label><label>{draft.discovery.source === "other" ? "Précisez votre réponse" : "Une précision ? (facultatif)"}<input required={draft.discovery.source === "other"} value={draft.discovery.detail} onChange={(e) => change({ discovery: { ...draft.discovery, detail: e.target.value } })} /></label></div>}
    {step === 5 && <div className="onboarding-recap"><p><strong>{draft.organization}</strong> · {draft.restaurant}</p><p>{industryLabels[activity.industry]} · {activity.trade}{activity.tradeDetail ? " — " + activity.tradeDetail : ""}</p><p>Votre priorité : {draft.answers.mainChallenge}</p><h3>Inclus dans votre espace</h3><ul>{capabilities.included.map((item) => <li key={item}>{item}</li>)}</ul><h3>Options à découvrir, sans activation automatique</h3><ul>{capabilities.optional.map((item) => <li key={item}>{item}</li>)}</ul><p>L’essai de trois jours commence à la création. Aucun paiement n’est prélevé automatiquement.</p></div>}
    {error && <p role="alert" className="onboarding-error">{error}</p>}
    <div className="onboarding-actions">{step > 0 && <button type="button" onClick={() => { setError(""); setStep(step - 1); change({step:step-1}); }}>Retour</button>}<button className="access-primary" disabled={busy}>{busy ? "Création en cours…" : step === steps.length - 1 ? "Créer mon espace" : "Continuer"}</button></div>
  </form>;
}
