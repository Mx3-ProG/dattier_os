"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import "./pilotage-addons.css";

const path = (restaurant: string, module: string) => `/api/restaurants/${encodeURIComponent(restaurant)}/pilotage/${module}`;
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Opération indisponible.");
  return result as T;
}
const money = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

type Scan = { id: string; city: string; sector: string; radius_km: number; status: string; page: number; total_pages: number; found_count: number; error_message: string | null; sources: Record<string, string> };
type Prospect = { id: string; name: string; siret: string | null; activity: string | null; address: string | null; score: number; score_signals: { label: string; points: number }[]; provenance: { provider: string; retrieved_at: string }[]; status: string; crm_company_id: string | null };
type ScannerData = { scans: Scan[]; prospects: Prospect[]; coverage: string };

export function ProspectScannerCenter({ restaurant, onOpenCrm }: { restaurant: string; onOpenCrm: () => void }) {
  const [data, setData] = useState<ScannerData | null>(null);
  const [city, setCity] = useState("");
  const [sector, setSector] = useState("");
  const [radius, setRadius] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = path(restaurant, "scanner");
  const refresh = useCallback(() => { void request<ScannerData>(url).then(setData).catch((cause) => setError((cause as Error).message)); }, [url]);
  useEffect(refresh, [refresh]);
  const run = useCallback(async (body: unknown) => {
    setBusy(true); setError("");
    try { setData(await request<ScannerData>(url, body)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }, [url]);
  const active = data?.scans.find((scan) => ["queued", "geocoding", "discovering"].includes(scan.status));
  const activeId = active?.id;
  const activeStatus = active?.status;
  const activePage = active?.page;
  useEffect(() => {
    if (!activeId || busy) return;
    const timer = window.setTimeout(() => { void run({ action: "step", scanId: activeId }); }, 1500);
    return () => window.clearTimeout(timer);
  }, [activeId, activeStatus, activePage, busy, run]);
  return <section className="pilotage-addon">
    <p>{data?.coverage ?? "Chargement du scanner…"}</p>
    {error && <p role="alert">{error}</p>}
    <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); void run({ action: "start", city, sector, radiusKm: radius }); }}>
      <label>Ville française<input value={city} onChange={(event) => setCity(event.target.value)} required placeholder="Toulouse" /></label>
      <label>Activité ou code NAF<input value={sector} onChange={(event) => setSector(event.target.value)} required placeholder="Boulangerie ou 10.71C" /></label>
      <label>Rayon (km)<input type="number" min={1} max={50} value={radius} onChange={(event) => setRadius(Number(event.target.value))} /></label>
      <Button disabled={busy || Boolean(active)}>Lancer un scan</Button>
    </form>
    {data?.scans[0] && <div className="pilotage-addon-summary" role="status">
      <strong>{data.scans[0].city} · {data.scans[0].sector}</strong>
      <span>{data.scans[0].status === "completed" ? "Terminé" : data.scans[0].status === "partial" ? "Partiel" : data.scans[0].status === "failed" ? "Échec" : "En cours"} · {data.scans[0].found_count} résultats · page {data.scans[0].page}/{data.scans[0].total_pages}</span>
      {data.scans[0].error_message && <span>{data.scans[0].error_message}</span>}
      <small>Géographie : {data.scans[0].sources.geo_api} · Registre : {data.scans[0].sources.sirene}</small>
    </div>}
    <div className="pilotage-addon-grid">
      {data?.prospects.map((prospect) => <article className="pilotage-addon-card" key={prospect.id}>
        <h3>{prospect.name}</h3>
        <p>{prospect.activity || "Activité inconnue"} · {prospect.address || "Adresse non fournie"}</p>
        <p>SIRET : {prospect.siret || "non fourni"} · Score : <strong>{prospect.score}/100</strong></p>
        <details><summary>Pourquoi ce score ?</summary><ul>{prospect.score_signals.map((signal) => <li key={signal.label}>{signal.label} : +{signal.points}</li>)}</ul><small>Source : {prospect.provenance.map((entry) => entry.provider).join(", ")}</small></details>
        <p>Statut : {prospect.status}</p>
        <div className="pilotage-addon-actions">
          <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "qualify", prospectId: prospect.id, status: "qualified" })}>Qualifier</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "qualify", prospectId: prospect.id, status: "review" })}>À revoir</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "qualify", prospectId: prospect.id, status: "refused" })}>Refuser</Button>
          {prospect.crm_company_id ? <Button onClick={onOpenCrm}>Voir dans le CRM</Button> : <Button disabled={busy} onClick={() => void run({ action: "transfer", prospectId: prospect.id })}>Transférer au CRM</Button>}
        </div>
      </article>)}
    </div>
    {data && data.prospects.length === 0 && <p>Aucun prospect trouvé pour le moment.</p>}
  </section>;
}

type Company = { id: string; name: string; city: string | null; siret: string | null; source: string; score: number | null };
type Contact = { id: string; company_id: string; name: string; role: string | null; email: string | null; phone: string | null };
type Opportunity = { id: string; company_id: string; title: string; stage: string; amount_cents: number; expected_on: string | null };
type Activity = { id: string; opportunity_id: string; kind: string; title: string; due_at: string | null; done_at: string | null };
type CrmData = { companies: Company[]; contacts: Contact[]; opportunities: Opportunity[]; activities: Activity[] };
const stages = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;
const stageNames: Record<string, string> = { lead: "Prospection", qualified: "Qualifié", proposal: "Proposition", negotiation: "Négociation", won: "Gagné", lost: "Perdu" };

export function PipelineCrmCenter({ restaurant }: { restaurant: string }) {
  const [data, setData] = useState<CrmData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactCompanyId, setContactCompanyId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const url = path(restaurant, "crm");
  useEffect(() => { void request<CrmData>(url).then(setData).catch((cause) => setError((cause as Error).message)); }, [url]);
  async function perform(body: unknown) {
    setBusy(true); setError("");
    try { setData(await request<CrmData>(url, body)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const byId = useMemo(() => new Map(data?.companies.map((company) => [company.id, company]) ?? []), [data?.companies]);
  return <section className="pilotage-addon">
    {error && <p role="alert">{error}</p>}
    <div className="pilotage-addon-forms">
      <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); void perform({ action: "company", name: companyName }); setCompanyName(""); }}>
        <h2>Nouvelle entreprise</h2><label>Nom<input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label><Button disabled={busy}>Ajouter</Button>
      </form>
      <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); void perform({ action: "contact", companyId: contactCompanyId, name: contactName, email: contactEmail || undefined }); setContactName(""); setContactEmail(""); }}>
        <h2>Nouveau contact</h2>
        <label>Entreprise<select required value={contactCompanyId} onChange={(event) => setContactCompanyId(event.target.value)}><option value="">Choisir</option>{data?.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label>Nom<input required value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
        <label>Email<input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></label>
        <Button disabled={busy}>Ajouter</Button>
      </form>
      <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); void perform({ action: "opportunity", companyId, title, amountCents: Math.round(Number(amount) * 100) }); setTitle(""); setAmount(""); }}>
        <h2>Nouvelle opportunité</h2>
        <label>Entreprise<select required value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Choisir</option>{data?.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label>Objet<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Montant estimé TTC (€)<input required type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><Button disabled={busy}>Créer</Button>
      </form>
    </div>
    <div className="pilotage-addon-pipeline">
      {stages.map((stage) => <section key={stage} className="pilotage-addon-stage" aria-label={stageNames[stage]}>
        <h2>{stageNames[stage]} <small>({data?.opportunities.filter((opportunity) => opportunity.stage === stage).length ?? 0})</small></h2>
        {data?.opportunities.filter((opportunity) => opportunity.stage === stage).map((opportunity) => <article key={opportunity.id} className="pilotage-addon-card">
          <h3>{opportunity.title}</h3><p>{byId.get(opportunity.company_id)?.name} · {money(opportunity.amount_cents)}</p>
          {data.contacts.filter((contact) => contact.company_id === opportunity.company_id).map((contact) => <p key={contact.id}><strong>{contact.name}</strong>{contact.role ? ` · ${contact.role}` : ""}{contact.email ? <> · <a href={`mailto:${contact.email}`}>{contact.email}</a></> : null}{contact.phone ? ` · ${contact.phone}` : ""}</p>)}
          <label>Étape<select value={opportunity.stage} onChange={(event) => void perform({ action: "stage", id: opportunity.id, stage: event.target.value })}>{stages.map((option) => <option key={option} value={option}>{stageNames[option]}</option>)}</select></label>
          <details><summary>Activités et relances</summary>
            <ul>{data.activities.filter((activity) => activity.opportunity_id === opportunity.id).map((activity) => <li key={activity.id}>{activity.done_at ? "✓ " : "○ "}{activity.title}{activity.due_at ? ` · ${new Date(activity.due_at).toLocaleDateString("fr-FR")}` : ""}{!activity.done_at && <button onClick={() => void perform({ action: "complete-activity", id: activity.id })}>Terminer</button>}</li>)}</ul>
            <form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("activityTitle") as HTMLInputElement; void perform({ action: "activity", opportunityId: opportunity.id, kind: "task", title: input.value }); input.value = ""; }}><input name="activityTitle" required placeholder="Nouvelle relance" /><Button disabled={busy}>Ajouter une tâche</Button></form>
          </details>
        </article>)}
      </section>)}
    </div>
    {data && data.companies.length === 0 && <p>Commencez par ajouter une entreprise ou transférer un prospect du scanner.</p>}
  </section>;
}

type HealthCustomer = { id: string; name: string; contact: string; consent: boolean; points: number; orders: number; orders_90d: number; ltv_cents: number; last_order_at: string | null; health: { total: number; recency: number; frequency: number; loyalty: number } };
type HealthData = { customers: HealthCustomer[]; trend: { month: string; revenue_cents: number; orders: number }[]; definition: string };
export function CustomerHealthCenter({ restaurant }: { restaurant: string }) {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void request<HealthData>(path(restaurant, "health")).then(setData).catch((cause) => setError((cause as Error).message)); }, [restaurant]);
  const max = Math.max(1, ...(data?.trend.map((point) => point.revenue_cents) ?? []));
  return <section className="pilotage-addon">
    {error && <p role="alert">{error}</p>}
    <p>{data?.definition ?? "Chargement des données client…"}</p>
    <div className="pilotage-addon-summary"><strong>{data?.customers.length ?? 0} clients</strong><span>LTV observée : {money(data?.customers.reduce((total, customer) => total + customer.ltv_cents, 0) ?? 0)}</span></div>
    <div className="pilotage-addon-trend" aria-label="Ventes payées des six derniers mois">{data?.trend.map((point) => <div key={point.month}><span style={{ height: `${Math.max(4, point.revenue_cents / max * 100)}%` }} /><small>{point.month}<br />{money(point.revenue_cents)}</small></div>)}</div>
    <div className="pilotage-addon-grid">{data?.customers.map((customer) => <article key={customer.id} className="pilotage-addon-card">
      <h3>{customer.name}</h3><p>{customer.orders} commandes payées · {money(customer.ltv_cents)} de LTV observée</p>
      <div className="pilotage-addon-health"><span style={{ width: `${customer.health.total}%` }} /></div><strong>Engagement : {customer.health.total}/100</strong>
      <p>Récence {customer.health.recency}/50 · fréquence {customer.health.frequency}/35 · fidélité {customer.health.loyalty}/15</p>
      <small>Dernier achat : {customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString("fr-FR") : "aucun achat payé connu"}</small>
    </article>)}</div>
    {data && data.customers.length === 0 && <p>Aucun client enregistré pour cet établissement.</p>}
  </section>;
}
