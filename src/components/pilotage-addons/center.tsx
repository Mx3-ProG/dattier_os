"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { customerSegmentLabels, type CustomerSegment } from "@/domain/crm/segments";
import { crmWorkQueue } from "@/domain/crm/work-queue";
import { crmOverview } from "@/domain/crm/overview";
import { SupportCenter } from "@/components/support/center";
import { ReputationCenter } from "@/components/reputation/center";
import { CustomerContext } from "@/components/pilotage-addons/customer-context";
import { PaymentRecovery } from "@/components/pilotage-addons/payment-recovery";
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
type Opportunity = { id: string; company_id: string; customer_id: string | null; title: string; stage: string; amount_cents: number; expected_on: string | null; proposal_status: "draft" | "sent" | "accepted" | "declined"; follow_up_at: string | null; proposal_description: string; valid_until: string | null };
type CrmCustomer = { id: string; name: string; contact: string; consent: boolean; points: number; segment: CustomerSegment; emailEligible: boolean; paid_orders: number; spend_cents: number; last_paid_at: string | null };
type Activity = { id: string; opportunity_id: string; kind: string; title: string; due_at: string | null; done_at: string | null };
type Inquiry = { id: string; company_id: string | null; customer_id: string | null; opportunity_id: string | null; subject: string; body: string; sender_name: string | null; sender_email: string | null; assigned_to: string | null; status: "new" | "in_progress" | "resolved"; source: string };
type Purchase = { order_id: string; customer_id: string; total: number; created_at: string };
type CustomerMessage = { id: string; customer_id: string; channel: string; purpose: string; subject: string | null; status: string; created_at: string };
type SupportCase = { id: string; customer_id: string; category: string; subject: string; status: string; created_at: string };
type CrmData = { companies: Company[]; contacts: Contact[]; customers: CrmCustomer[]; purchases: Purchase[]; messages: CustomerMessage[]; supportCases: SupportCase[]; assignees: { id: string; name: string }[]; opportunities: Opportunity[]; activities: Activity[]; inquiries: Inquiry[]; proposalEmailAvailable: boolean; automation: { proposal_followup_enabled: boolean; proposal_followup_days: number; inquiry_assignment_enabled: boolean; inquiry_assignee_id: string | null }; deliveries: { id: string; opportunity_id: string; recipient: string; sent_at: string }[]; campaigns: { id: string; name: string; segment: CustomerSegment; subject: string; body: string; status: "draft" | "prepared" | "sending" | "completed"; recipient_count: number; sent_count: number; skipped_count: number; error_count: number }[]; segmentStats: { segment: CustomerSegment; customers: number; email_eligible: number }[] };
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
  const [inquirySubject, setInquirySubject] = useState("");
  const [inquiryBody, setInquiryBody] = useState("");
  const [inquiryCustomerId, setInquiryCustomerId] = useState("");
  const [opportunityCustomerId, setOpportunityCustomerId] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<CustomerSegment | "all">("all");
  const [campaignName, setCampaignName] = useState("");
  const [campaignSegment, setCampaignSegment] = useState<CustomerSegment>("new");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const url = path(restaurant, "crm");
  useEffect(() => { void request<CrmData>(url).then(setData).catch((cause) => setError((cause as Error).message)); }, [url]);
  async function perform(body: unknown) {
    setBusy(true); setError("");
    try { setData(await request<CrmData>(url, body)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const byId = useMemo(() => new Map(data?.companies.map((company) => [company.id, company]) ?? []), [data?.companies]);
  const dueProposals = useMemo(() => (data?.opportunities ?? []).filter((opportunity) => opportunity.follow_up_at && !["accepted", "declined"].includes(opportunity.proposal_status)).sort((a, b) => (a.follow_up_at ?? "").localeCompare(b.follow_up_at ?? "")), [data?.opportunities]);
  const workQueue = useMemo(() => data ? crmWorkQueue(data) : [], [data]);
  const overview = useMemo(() => data ? crmOverview(data) : null, [data]);
  return <section className="pilotage-addon">
    {error && <p role="alert">{error}</p>}
    {overview && <section aria-label="Vue CRM" className="pilotage-addon-summary">
      <h2>Vue CRM</h2>
      <p><strong>{overview.openInquiries}</strong> demandes ouvertes, dont {overview.unassignedInquiries} sans responsable</p>
      <p><strong>{overview.openOpportunities}</strong> opportunités en cours · {money(overview.pipelineCents)} estimés</p>
      <p>Affaires gagnées : {money(overview.wonCents)} de montants proposés</p>
      <p><strong>{overview.activeSupportCases}</strong> dossiers SAV actifs · {overview.campaignRecipientsPending} e-mails de campagne en attente</p>
      <p>Montants estimés, non encaissés. La vue porte sur les dossiers chargés dans le CRM.</p>
    </section>}
    <section aria-label="À traiter aujourd’hui">
      <h2>À traiter aujourd’hui</h2>
      <p>{workQueue.length} demande{workQueue.length > 1 ? "s" : ""} ou relance{workQueue.length > 1 ? "s" : ""} à traiter.</p>
      {workQueue.length === 0 && data && <p>Aucune demande ou relance échue.</p>}
      <ul>{workQueue.map((item) => <li key={item.key}>
        <strong>{item.title}</strong> · {item.detail}{item.dueAt ? ` · ${new Date(item.dueAt).toLocaleDateString("fr-FR")}` : ""}{item.overdue ? " · En retard" : ""}
        {item.kind === "inquiry" && <Button disabled={busy} onClick={() => void perform({ action: "inquiry-status", id: item.actionId, status: "in_progress" })}>Prendre en charge</Button>}
        {item.kind === "task" && <Button disabled={busy} onClick={() => void perform({ action: "complete-activity", id: item.actionId })}>Terminer</Button>}
      </li>)}</ul>
    </section>
    {dueProposals.length > 0 && <section aria-label="Relances prévues">
      <h2>Relances prévues</h2>
      <ul>{dueProposals.map((opportunity) => <li key={opportunity.id}>{new Date(opportunity.follow_up_at!).toLocaleDateString("fr-FR")} · {opportunity.title} · {byId.get(opportunity.company_id)?.name}</li>)}</ul>
    </section>}
    <section aria-label="Demandes commerciales">
      <h2>Demandes commerciales</h2>
      <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); void perform({ action: "inquiry", subject: inquirySubject, body: inquiryBody, customerId: inquiryCustomerId || undefined }); setInquirySubject(""); setInquiryBody(""); }}>
        <label>Objet<input required value={inquirySubject} onChange={(event) => setInquirySubject(event.target.value)} /></label>
        <label>Demande<textarea required value={inquiryBody} onChange={(event) => setInquiryBody(event.target.value)} /></label>
        <label>Client<select value={inquiryCustomerId} onChange={(event) => setInquiryCustomerId(event.target.value)}><option value="">Sans client lié</option>{data?.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <Button disabled={busy}>Ajouter une demande</Button>
      </form>
      {data?.inquiries.map((inquiry) => <article className="pilotage-addon-card" key={inquiry.id}>
        <h3>{inquiry.subject}</h3><p>{inquiry.body}</p>
        {inquiry.sender_email && <p>De : {inquiry.sender_name} · <a href={`mailto:${inquiry.sender_email}`}>{inquiry.sender_email}</a></p>}
        {inquiry.customer_id && <p>Client : {data.customers.find((customer) => customer.id === inquiry.customer_id)?.name ?? "Client lié"}</p>}
        <label>Statut <select value={inquiry.status} disabled={busy} onChange={(event) => void perform({ action: "inquiry-status", id: inquiry.id, status: event.target.value })}>
          <option value="new">Nouvelle</option><option value="in_progress">En cours</option><option value="resolved">Résolue</option>
        </select></label>
        <label>Responsable <select value={inquiry.assigned_to ?? ""} disabled={busy} onChange={(event) => void perform({ action: "inquiry-assign", id: inquiry.id, profileId: event.target.value || null })}>
          <option value="">Non attribuée</option>{data.assignees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select></label>
        {!inquiry.opportunity_id && <form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("proposalAmount") as HTMLInputElement; void perform({ action: "inquiry-to-proposal", id: inquiry.id, amountCents: Math.round(Number(input.value) * 100) }); }}>
          <label>Montant proposé TTC (€) <input name="proposalAmount" type="number" min="0" step="0.01" required /></label>
          <Button disabled={busy}>Créer une proposition</Button>
        </form>}
      </article>)}
    </section>
    <section aria-label="Dossiers clients">
      <h2>Dossiers clients</h2>
      <label>Segment <select value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value as CustomerSegment | "all")}>
        <option value="all">Tous les clients ({data?.segmentStats.reduce((total, row) => total + row.customers, 0) ?? 0})</option>
        {(Object.keys(customerSegmentLabels) as CustomerSegment[]).map((segment) => <option key={segment} value={segment}>{customerSegmentLabels[segment]} ({data?.segmentStats.find((row) => row.segment === segment)?.customers ?? 0})</option>)}
      </select></label>
      <p>Segments calculés sur les achats en ligne payés connus de ce commerce. L’éligibilité e-mail exige une adresse valide et un accord marketing. Les listes affichent au plus 1 000 fiches ; les compteurs couvrent tous les clients.</p>
      {data?.customers.filter((customer) => segmentFilter === "all" || customer.segment === segmentFilter).map((customer) => <p key={`segment-${customer.id}`}>
        <strong>{customer.name}</strong> · {customerSegmentLabels[customer.segment]} · {customer.paid_orders} achat{customer.paid_orders > 1 ? "s" : ""} · {money(customer.spend_cents)} · {customer.emailEligible ? "E-mail autorisé" : "Pas d’e-mail marketing"}
      </p>)}
      {data?.customers.map((customer) => {
        if (segmentFilter !== "all" && customer.segment !== segmentFilter) return null;
        const inquiries = data.inquiries.filter((inquiry) => inquiry.customer_id === customer.id);
        const opportunities = data.opportunities.filter((opportunity) => opportunity.customer_id === customer.id);
        const purchases = data.purchases.filter((purchase) => purchase.customer_id === customer.id);
        const messages = data.messages.filter((message) => message.customer_id === customer.id);
        const supportCases = data.supportCases.filter((item) => item.customer_id === customer.id);
        if (!inquiries.length && !opportunities.length && !purchases.length && !messages.length && !supportCases.length) return null;
        return <details className="pilotage-addon-card" key={customer.id}>
          <summary>{customer.name} · {inquiries.length} demande{inquiries.length > 1 ? "s" : ""} · {opportunities.length} proposition{opportunities.length > 1 ? "s" : ""} · {purchases.length} achat{purchases.length > 1 ? "s" : ""}</summary>
          <p>{customer.contact}</p>
          <ul>{inquiries.map((inquiry) => <li key={inquiry.id}>Demande : {inquiry.subject} · {inquiry.status === "resolved" ? "résolue" : inquiry.status === "in_progress" ? "en cours" : "nouvelle"}</li>)}</ul>
          <ul>{opportunities.map((opportunity) => <li key={opportunity.id}>Proposition : {opportunity.title} · {money(opportunity.amount_cents)} · {opportunity.proposal_status}</li>)}</ul>
          <ul>{purchases.map((purchase) => <li key={purchase.order_id}>Achat payé : {money(purchase.total)} · {new Date(purchase.created_at).toLocaleDateString("fr-FR")}</li>)}</ul>
          <ul>{messages.map((message) => <li key={message.id}>Message {message.channel} : {message.subject || message.purpose} · {message.status} · {new Date(message.created_at).toLocaleDateString("fr-FR")}</li>)}</ul>
          <ul>{supportCases.map((item) => <li key={item.id}>SAV : {item.subject} · {item.status} · {new Date(item.created_at).toLocaleDateString("fr-FR")}</li>)}</ul>
        </details>;
      })}
    </section>
    <section aria-label="Campagnes clients">
      <h2>Campagnes clients</h2>
      <p>Préparez un brouillon, figez ses destinataires, puis lancez chaque lot de cinq e-mails. Les accords et les adresses sont revérifiés avant l’envoi.</p>
      <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); void perform({ action: "campaign-draft", name: campaignName, segment: campaignSegment, subject: campaignSubject, body: campaignBody }); }}>
        <label>Nom interne <input required maxLength={180} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></label>
        <label>Segment <select value={campaignSegment} onChange={(event) => setCampaignSegment(event.target.value as CustomerSegment)}>{(Object.keys(customerSegmentLabels) as CustomerSegment[]).map((segment) => <option key={segment} value={segment}>{customerSegmentLabels[segment]}</option>)}</select></label>
        <label>Objet de l’e-mail <input required maxLength={150} value={campaignSubject} onChange={(event) => setCampaignSubject(event.target.value)} /></label>
        <label>Message <textarea required maxLength={5000} value={campaignBody} onChange={(event) => setCampaignBody(event.target.value)} /></label>
        <Button disabled={busy}>Enregistrer le brouillon</Button>
      </form>
      {data?.campaigns.map((campaign) => <article className="pilotage-addon-card" key={campaign.id}>
        <h3>{campaign.name}</h3><p>{customerSegmentLabels[campaign.segment]} · {campaign.status === "draft" ? `Brouillon · ${data.segmentStats.find((row) => row.segment === campaign.segment)?.email_eligible ?? 0} destinataires éligibles sur ${data.segmentStats.find((row) => row.segment === campaign.segment)?.customers ?? 0} clients` : `${campaign.status === "prepared" ? "Préparée" : campaign.status === "sending" ? "En cours" : "Terminée"} · ${campaign.sent_count} envoyés · ${campaign.skipped_count} exclus · ${campaign.error_count} erreurs · ${campaign.recipient_count - campaign.sent_count - campaign.skipped_count - campaign.error_count} en attente`}</p>
        {campaign.status === "draft" && <details><summary>Modifier le brouillon</summary>
          <form key={`${campaign.id}-${campaign.subject}-${campaign.body}`} className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value; void perform({ action: "campaign-update", id: campaign.id, name: value("name"), segment: value("segment"), subject: value("subject"), body: value("body") }); }}>
            <label>Nom <input name="name" required maxLength={180} defaultValue={campaign.name} /></label>
            <label>Segment <select name="segment" defaultValue={campaign.segment}>{(Object.keys(customerSegmentLabels) as CustomerSegment[]).map((segment) => <option key={segment} value={segment}>{customerSegmentLabels[segment]}</option>)}</select></label>
            <label>Objet <input name="subject" required maxLength={150} defaultValue={campaign.subject} /></label>
            <label>Message <textarea name="body" required maxLength={5000} defaultValue={campaign.body} /></label>
            <Button disabled={busy}>Enregistrer</Button>
          </form>
          <Button variant="secondary" disabled={busy} onClick={() => void perform({ action: "campaign-delete", id: campaign.id })}>Supprimer le brouillon</Button>
        </details>}
        {campaign.status === "draft" && <Button disabled={busy} onClick={() => void perform({ action: "campaign-prepare", id: campaign.id })}>Figer les destinataires</Button>}
        {(["prepared", "sending"].includes(campaign.status) && data.proposalEmailAvailable) && <Button disabled={busy} onClick={() => void perform({ action: "campaign-send-batch", id: campaign.id })}>Envoyer les 5 prochains e-mails</Button>}
      </article>)}
    </section>
    <section aria-label="Automatisations CRM">
      <h2>Automatisations CRM</h2>
      <p>Après l’envoi d’une proposition, créer une tâche interne et une date de relance. Aucun e-mail n’est envoyé automatiquement.</p>
      {data && <form key={`${data.automation.proposal_followup_enabled}-${data.automation.proposal_followup_days}`} className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void perform({ action: "automation-settings", enabled: (form.elements.namedItem("enabled") as HTMLInputElement).checked, days: Number((form.elements.namedItem("days") as HTMLInputElement).value) }); }}>
        <label><input name="enabled" type="checkbox" defaultChecked={data.automation.proposal_followup_enabled} /> Activer la relance après une proposition envoyée</label>
        <label>Délai en jours <input name="days" type="number" min={1} max={30} required defaultValue={data.automation.proposal_followup_days} /></label>
        <Button disabled={busy}>Enregistrer</Button>
      </form>}
      <p>Attribuer les nouvelles demandes à un membre de l’équipe. Les attributions manuelles sont conservées.</p>
      {data && <form key={`${data.automation.inquiry_assignment_enabled}-${data.automation.inquiry_assignee_id}`} className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void perform({ action: "inquiry-assignment-settings", enabled: (form.elements.namedItem("assignEnabled") as HTMLInputElement).checked, profileId: (form.elements.namedItem("assignee") as HTMLSelectElement).value || null }); }}>
        <label><input name="assignEnabled" type="checkbox" defaultChecked={data.automation.inquiry_assignment_enabled} /> Activer l’attribution automatique</label>
        <label>Responsable <select name="assignee" defaultValue={data.automation.inquiry_assignee_id ?? ""}><option value="">Choisir</option>{data.assignees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <Button disabled={busy}>Enregistrer</Button>
      </form>}
    </section>
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
      <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); void perform({ action: "opportunity", companyId, customerId: opportunityCustomerId || undefined, title, amountCents: Math.round(Number(amount) * 100) }); setTitle(""); setAmount(""); }}>
        <h2>Nouvelle opportunité</h2>
        <label>Entreprise<select required value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Choisir</option>{data?.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label>Client<select value={opportunityCustomerId} onChange={(event) => setOpportunityCustomerId(event.target.value)}><option value="">Sans client lié</option>{data?.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label>Objet<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Montant estimé TTC (€)<input required type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><Button disabled={busy}>Créer</Button>
      </form>
    </div>
    <div className="pilotage-addon-pipeline">
      {stages.map((stage) => <section key={stage} className="pilotage-addon-stage" aria-label={stageNames[stage]}>
        <h2>{stageNames[stage]} <small>({data?.opportunities.filter((opportunity) => opportunity.stage === stage).length ?? 0})</small></h2>
        {data?.opportunities.filter((opportunity) => opportunity.stage === stage).map((opportunity) => <article key={opportunity.id} className="pilotage-addon-card">
          <h3>{opportunity.title}</h3><p>{byId.get(opportunity.company_id)?.name} · {money(opportunity.amount_cents)}</p>
          <a href={`${url}/${encodeURIComponent(opportunity.id)}/proposal`} download> Télécharger la proposition PDF</a>
          {opportunity.customer_id && <p>Client : {data.customers.find((customer) => customer.id === opportunity.customer_id)?.name ?? "Client lié"}</p>}
          <label>Proposition <select value={opportunity.proposal_status} disabled={busy || ["accepted", "declined"].includes(opportunity.proposal_status)} onChange={(event) => void perform({ action: "proposal", id: opportunity.id, status: event.target.value, followUpAt: opportunity.follow_up_at })}><option value="draft" disabled={opportunity.proposal_status !== "draft"}>Brouillon</option><option value="sent" disabled>Envoyée</option><option value="accepted">Acceptée</option><option value="declined">Refusée</option></select></label>
          {opportunity.proposal_status === "draft" && data.proposalEmailAvailable && data.inquiries.some((inquiry) => inquiry.opportunity_id === opportunity.id && inquiry.sender_email && inquiry.source === "website") && <Button disabled={busy} onClick={() => void perform({ action: "send-proposal", id: opportunity.id })}>Envoyer le PDF à {data.inquiries.find((inquiry) => inquiry.opportunity_id === opportunity.id && inquiry.sender_email && inquiry.source === "website")?.sender_email}</Button>}
          {data.deliveries.filter((delivery) => delivery.opportunity_id === opportunity.id).map((delivery) => <p key={delivery.id}>Envoyée à {delivery.recipient} le {new Date(delivery.sent_at).toLocaleDateString("fr-FR")}</p>)}
          <label>Relance prévue <input type="date" value={opportunity.follow_up_at?.slice(0, 10) ?? ""} disabled={busy} onChange={(event) => void perform({ action: "proposal", id: opportunity.id, status: opportunity.proposal_status, followUpAt: event.target.value ? `${event.target.value}T09:00:00.000Z` : null })} /></label>
          <form key={`${opportunity.id}-${opportunity.proposal_description}-${opportunity.valid_until}`} onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value; const validUntil = (form.elements.namedItem("validUntil") as HTMLInputElement).value; void perform({ action: "proposal-details", id: opportunity.id, description, validUntil: validUntil || null }); }}>
            <label>Description <textarea name="description" maxLength={300} defaultValue={opportunity.proposal_description} readOnly={opportunity.proposal_status !== "draft"} /></label>
            <label>Valable jusqu’au <input name="validUntil" type="date" defaultValue={opportunity.valid_until?.slice(0, 10) ?? ""} readOnly={opportunity.proposal_status !== "draft"} /></label>
            {opportunity.proposal_status === "draft" && <Button disabled={busy}>Enregistrer la proposition</Button>}
          </form>
          {data.contacts.filter((contact) => contact.company_id === opportunity.company_id).map((contact) => <p key={contact.id}><strong>{contact.name}</strong>{contact.role ? ` · ${contact.role}` : ""}{contact.email ? <> · <a href={`mailto:${contact.email}`}>{contact.email}</a></> : null}{contact.phone ? ` · ${contact.phone}` : ""}</p>)}
          <label>Étape<select value={opportunity.stage} onChange={(event) => void perform({ action: "stage", id: opportunity.id, stage: event.target.value })}>{stages.map((option) => <option key={option} value={option}>{stageNames[option]}</option>)}</select></label>
          <details><summary>Activités et relances</summary>
            <ul>{data.activities.filter((activity) => activity.opportunity_id === opportunity.id).map((activity) => <li key={activity.id}>{activity.done_at ? "✓ " : "○ "}{activity.title}{activity.due_at ? ` · ${new Date(activity.due_at).toLocaleDateString("fr-FR")}` : ""}{!activity.done_at && <button onClick={() => void perform({ action: "complete-activity", id: activity.id })}>Terminer</button>}</li>)}</ul>
            <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = (form.elements.namedItem("activityTitle") as HTMLInputElement).value; const date = (form.elements.namedItem("activityDue") as HTMLInputElement).value; void perform({ action: "activity", opportunityId: opportunity.id, kind: "task", title, dueAt: date ? new Date(`${date}T09:00:00`).toISOString() : undefined }); form.reset(); }}><input name="activityTitle" required placeholder="Nouvelle relance" /><label>Échéance <input name="activityDue" type="date" /></label><Button disabled={busy}>Ajouter une tâche</Button></form>
          </details>
        </article>)}
      </section>)}
    </div>
    {data && data.companies.length === 0 && <p>Commencez par ajouter une entreprise ou transférer un prospect du scanner.</p>}
    <SupportCenter restaurant={restaurant} />
    <ReputationCenter restaurant={restaurant} />
    <CustomerContext restaurant={restaurant} />
    <PaymentRecovery restaurant={restaurant} />
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
