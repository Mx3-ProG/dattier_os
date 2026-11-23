"use client";
import { useEffect, useState, type FormEvent } from "react";

type Beneficiary = { id: string; name: string; address: string };
type Worker = { id: string; profile_id: string; skills: string[]; service_area: string };
type Service = { id: string; name: string; hourly_cents: number; compliance_required: boolean; compliance_verified_at: string | null };
type Grant = { id: string; beneficiary_id: string; profile_id: string };
type Visit = { id: string; beneficiary_id: string; worker_id: string | null; service_name: string; starts_at: string; ends_at: string; status: string; declared_minutes: number | null; validated_minutes: number | null; billable_cents: number | null; invoice_id: string | null; report: string };
type Person = { id: string; name: string };
type State = { customers: Person[]; team: Person[]; beneficiaries: Beneficiary[]; workers: Worker[]; services: Service[]; taxRates: {id:string;label:string;rate_bp:number}[]; grants: Grant[]; visits: Visit[] };
type Slot={workerId:string;startsAt:string;endsAt:string};

export function HomeAssistanceCenter({ restaurant }: { restaurant: string }) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [slots,setSlots]=useState<Slot[]>([]);
  const endpoint = `/api/restaurants/${encodeURIComponent(restaurant)}/home-assistance`;
  async function refresh() {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Chargement impossible.");
    setData(body);
  }
  useEffect(() => { void refresh().catch((e) => setError(e.message)); }, [restaurant]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(input: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Enregistrement impossible.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur inconnue."); }
    finally { setBusy(false); }
  }
  const form = (action: string, extract: (fd: FormData) => Record<string, unknown>) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit({ action, ...extract(new FormData(event.currentTarget)) });
    event.currentTarget.reset();
  };
  return <main style={{ display: "grid", gap: 24, maxWidth: 950 }}>
    <h2>Interventions à domicile</h2>
    {error && <p role="alert">{error}</p>}
    <section><h3>Ajouter un bénéficiaire</h3><p>Créez d’abord sa fiche dans Clients.</p>
      <form onSubmit={form("beneficiary", fd => ({ customerId: fd.get("customerId"), name: fd.get("name"), address: fd.get("address") }))}>
        <select name="customerId" aria-label="Client responsable" required><option value="">Client responsable</option>{data?.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select> <input name="name" aria-label="Nom du bénéficiaire" placeholder="Nom" required /> <input name="address" aria-label="Adresse du domicile" placeholder="Adresse" required /> <button disabled={busy}>Ajouter</button>
      </form>
      <ul>{data?.beneficiaries.map(b => <li key={b.id}>{b.name} — {b.address} <small>({b.id})</small></li>)}</ul>
    </section>
    <section><h3>Prestations et tarifs</h3>
      <form onSubmit={form("service", fd => ({ name: fd.get("name"), hourlyCents: Math.round(Number(fd.get("price"))*100), minimumMinutes: Number(fd.get("minimum")), travelCents: Math.round(Number(fd.get("travel"))*100),requiredSkills:String(fd.get("skills")??"").split(",").map(s=>s.trim()).filter(Boolean), complianceRequired: fd.get("regulated")==="on" }))}>
        <input name="name" aria-label="Nom de la prestation" placeholder="Prestation" required /><input name="price" aria-label="Tarif horaire en euros" type="number" min="0" step="0.01" required /><input name="minimum" aria-label="Durée minimale en minutes" type="number" min="15" max="1440" defaultValue="60" required /><input name="travel" aria-label="Déplacement en euros" type="number" min="0" step="0.01" defaultValue="0" required /><input name="skills" aria-label="Compétences requises" placeholder="Compétences requises, séparées par des virgules"/><label><input name="regulated" type="checkbox" /> Vérification réglementaire nécessaire</label><button disabled={busy}>Créer</button>
      </form>
      <ul>{data?.services.map(s => <li key={s.id}>{s.name} — {(s.hourly_cents/100).toFixed(2)} €/h {s.compliance_required && !s.compliance_verified_at && <form onSubmit={form("verifyService",fd=>({serviceId:s.id,evidence:fd.get("evidence")}))}><input name="evidence" aria-label="Justificatif de conformité" placeholder="Référence et justification de conformité" minLength={10} required /><button disabled={busy}>Valider la conformité</button></form>}</li>)}</ul>
    </section>
    <section><h3>Disponibilités et absences</h3>
      <form onSubmit={form("availability", fd => ({ workerId:fd.get("workerId"),startsAt:new Date(String(fd.get("startsAt"))).toISOString(),endsAt:new Date(String(fd.get("endsAt"))).toISOString(),available:fd.get("available")==="yes" }))}>
        <select name="workerId" aria-label="Intervenant pour le créneau" required><option value="">Intervenant</option>{data?.workers.map(w => <option key={w.id} value={w.id}>{w.profile_id}</option>)}</select><input name="startsAt" aria-label="Début de disponibilité" type="datetime-local" required /><input name="endsAt" aria-label="Fin de disponibilité" type="datetime-local" required /><select name="available" aria-label="Type de créneau"><option value="yes">Disponible</option><option value="no">Indisponible</option></select><button disabled={busy}>Enregistrer</button>
      </form>
    </section>
    <section><h3>Proches autorisés</h3>
      <form onSubmit={form("grant", fd => ({ beneficiaryId: fd.get("beneficiaryId"), profileId: fd.get("profileId") }))}>
        <select name="beneficiaryId" aria-label="Bénéficiaire du proche" required><option value="">Bénéficiaire</option>{data?.beneficiaries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <input name="profileId" aria-label="Identifiant du compte proche" placeholder="Identifiant du compte proche" required /> <button disabled={busy}>Autoriser</button>
      </form>
      <ul>{data?.grants.map(g => <li key={g.id}>{data.beneficiaries.find(b => b.id === g.beneficiary_id)?.name ?? "Bénéficiaire"} — {g.profile_id} <button disabled={busy} onClick={() => void submit({ action: "revoke", grantId: g.id })}>Révoquer</button></li>)}</ul>
    </section>
    <section><h3>Intervenants</h3>
      <form onSubmit={form("worker", fd => ({ profileId: fd.get("profileId"), skills: String(fd.get("skills") ?? "").split(",").map(s => s.trim()).filter(Boolean), serviceArea: fd.get("serviceArea") }))}>
        <select name="profileId" aria-label="Membre de l’équipe" required><option value="">Membre de l’équipe</option>{data?.team.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> <input name="skills" aria-label="Compétences séparées par des virgules" placeholder="Compétences" /> <input name="serviceArea" aria-label="Zone desservie" placeholder="Zone" /> <button disabled={busy}>Ajouter</button>
      </form>
      <ul>{data?.workers.map(w => <li key={w.id}>{w.profile_id} — {w.skills.join(", ")} — {w.service_area}</li>)}</ul>
    </section>
    <section><h3>Planifier une intervention</h3>
      <form onSubmit={async e=>{e.preventDefault();setError("");const fd=new FormData(e.currentTarget);try {const response=await fetch(`${endpoint}?serviceId=${encodeURIComponent(String(fd.get("serviceId")))}&day=${encodeURIComponent(String(fd.get("day")))}`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.error?.message??"Recherche impossible.");setSlots(body);}catch(e){setError(e instanceof Error?e.message:"Erreur inconnue.");}}}>
        <select name="serviceId" aria-label="Prestation recherchée" required><option value="">Prestation</option>{data?.services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input name="day" type="date" aria-label="Date recherchée" required/><button>Voir les créneaux</button>
      </form>
      {slots.length>0 && <ul>{slots.map(slot=><li key={`${slot.workerId}-${slot.startsAt}`}>{new Date(slot.startsAt).toLocaleString("fr-FR")} — {data?.workers.find(w=>w.id===slot.workerId)?.profile_id ?? slot.workerId}</li>)}</ul>}
      <form onSubmit={form("visit", fd => ({ beneficiaryId: fd.get("beneficiaryId"), workerId: fd.get("workerId") || null, serviceId:fd.get("serviceId"), startsAt: new Date(String(fd.get("startsAt"))).toISOString(), endsAt: new Date(String(fd.get("endsAt"))).toISOString(), frequency:fd.get("frequency"),occurrences:Number(fd.get("occurrences")) }))}>
        <select name="beneficiaryId" aria-label="Bénéficiaire" required><option value="">Bénéficiaire</option>{data?.beneficiaries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select name="workerId" aria-label="Intervenant"><option value="">À affecter</option>{data?.workers.map(w => <option key={w.id} value={w.id}>{w.profile_id}</option>)}</select>
        <select name="serviceId" aria-label="Prestation" required><option value="">Prestation</option>{data?.services.filter(s=>!s.compliance_required || s.compliance_verified_at).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input name="startsAt" type="datetime-local" aria-label="Début" required /><input name="endsAt" type="datetime-local" aria-label="Fin" required /><select name="frequency" aria-label="Récurrence"><option value="once">Une fois</option><option value="daily">Chaque jour</option><option value="weekly">Chaque semaine</option></select><input name="occurrences" type="number" min="1" max="52" defaultValue="1" aria-label="Nombre de visites" required /> <button disabled={busy}>Planifier</button>
      </form>
      <ul>{data?.visits.map(v => <li key={v.id}>
        <strong>{v.service_name}</strong> — {new Date(v.starts_at).toLocaleString("fr-FR")} — {v.status} — {data.beneficiaries.find(b => b.id === v.beneficiary_id)?.name ?? "Bénéficiaire"}
        {!v.worker_id && v.status === "requested" && <form onSubmit={form("assign", fd => ({ visitId: v.id, workerId: fd.get("workerId") }))}><select name="workerId" aria-label="Affecter un intervenant" required><option value="">Intervenant</option>{data.workers.map(w => <option key={w.id} value={w.id}>{w.profile_id}</option>)}</select><button disabled={busy}>Affecter</button></form>}
        {(v.status === "requested" || v.status === "confirmed") && <form onSubmit={form("reschedule",fd=>({visitId:v.id,startsAt:new Date(String(fd.get("startsAt"))).toISOString(),endsAt:new Date(String(fd.get("endsAt"))).toISOString()}))}><input name="startsAt" type="datetime-local" aria-label="Nouveau début" required/><input name="endsAt" type="datetime-local" aria-label="Nouvelle fin" required/><button disabled={busy}>Reporter</button></form>}
        {(v.status === "requested" || v.status === "confirmed") && <button disabled={busy} onClick={()=>void submit({action:"status",visitId:v.id,status:"cancelled"})}>Annuler</button>}
        {v.status === "requested" && <button disabled={busy} onClick={() => void submit({ action: "status", visitId: v.id, status: "confirmed" })}>Confirmer</button>}
        {v.status === "confirmed" && <button disabled={busy} onClick={() => void submit({ action: "status", visitId: v.id, status: "in_progress" })}>Commencer</button>}
        {v.status === "in_progress" && <form onSubmit={form("report", fd => ({ visitId: v.id, report: fd.get("report"), declaredMinutes: Number(fd.get("minutes")) }))}><input name="report" aria-label="Compte rendu" placeholder="Compte rendu" required /><input name="minutes" type="number" min="0" max="1440" aria-label="Durée déclarée en minutes" required /><button disabled={busy}>Enregistrer le rapport</button></form>}
        {v.status === "in_progress" && v.declared_minutes !== null && <button disabled={busy} onClick={() => void submit({ action: "status", visitId: v.id, status: "completed" })}>Terminer</button>}
        {v.status === "completed" && v.validated_minutes === null && <form onSubmit={form("validate", fd => ({ visitId: v.id, validatedMinutes: Number(fd.get("minutes")) }))}><input name="minutes" type="number" min="0" max="1440" defaultValue={v.declared_minutes ?? 0} aria-label="Durée validée" required /><button disabled={busy}>Valider la durée</button></form>}
        {v.status === "completed" && v.validated_minutes !== null && <span> — Durée validée : {v.validated_minutes} min — {(Number(v.billable_cents ?? 0)/100).toFixed(2)} € {v.invoice_id ? `— Brouillon de facture ${v.invoice_id}` : <form onSubmit={form("invoice",fd=>({visitId:v.id,rateId:fd.get("rateId")||null}))}><select name="rateId" aria-label="Taux de TVA"><option value="">Franchise de TVA</option>{data.taxRates.map(rate=><option key={rate.id} value={rate.id}>{rate.label} ({rate.rate_bp/100} %)</option>)}</select><button disabled={busy}>Créer le brouillon de facture</button></form>}</span>}
      </li>)}</ul>
    </section>
    <section><h3>Facturation mensuelle</h3><p>Prépare jusqu’à 100 brouillons pour les visites terminées et validées du mois. Vérifiez-les dans Factures clients avant émission.</p>
      <form onSubmit={form("invoiceMonth",fd=>({month:fd.get("month"),rateId:fd.get("rateId")||null}))}>
        <input name="month" type="month" aria-label="Mois à facturer" required/><select name="rateId" aria-label="Taux de TVA du mois"><option value="">Franchise de TVA</option>{data?.taxRates.map(rate=><option key={rate.id} value={rate.id}>{rate.label} ({rate.rate_bp/100} %)</option>)}</select><button disabled={busy}>Préparer les brouillons</button>
      </form>
    </section>
  </main>;
}
