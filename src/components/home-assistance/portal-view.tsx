"use client";
import { useState, type FormEvent } from "react";
type Beneficiary={id:string;name:string;address:string};
type Visit={id:string;beneficiary_id:string;service_name:string;starts_at:string;ends_at:string;status:string;declared_minutes:number|null;validated_minutes:number|null};
type Service={id:string;name:string;hourly_cents:number;minimum_minutes:number;travel_cents:number};
export function HomePortalView({restaurant,data}:{restaurant:string;data:{beneficiaries:Beneficiary[];visits:Visit[];services:Service[]}}) {
  const [error,setError]=useState("");
  const [sent,setSent]=useState(false);
  async function send(event:FormEvent<HTMLFormElement>,payload:Record<string,unknown>) {
    event.preventDefault();setError("");
    const fd=new FormData(event.currentTarget);
    try {
      const response=await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/home-assistance/portal`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,...(payload.action==="report"?{report:fd.get("report"),declaredMinutes:Number(fd.get("minutes"))}:{beneficiaryId:fd.get("beneficiaryId"),serviceId:fd.get("serviceId"),startsAt:new Date(String(fd.get("startsAt"))).toISOString(),endsAt:new Date(String(fd.get("endsAt"))).toISOString()})})});
      const body=await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Enregistrement impossible.");
      setSent(true);window.location.reload();
    } catch(e) {setError(e instanceof Error?e.message:"Erreur inconnue.");}
  }
  return <main style={{maxWidth:850,margin:"2rem auto",padding:20}}><h1>Services à domicile</h1><p>Vos bénéficiaires et interventions accessibles avec votre compte.</p>
    {error && <p role="alert">{error}</p>}{sent && <p>Compte rendu enregistré.</p>}
    <h2>Bénéficiaires</h2><ul>{data.beneficiaries.map(b=><li key={b.id}>{b.name} — {b.address}</li>)}</ul>
    {data.beneficiaries.length>0 && data.services.length>0 && <section><h2>Demander une prestation</h2><p>La demande sera confirmée par l’équipe après affectation.</p><form onSubmit={e=>void send(e,{action:"book"})}><select name="beneficiaryId" aria-label="Bénéficiaire" required><option value="">Bénéficiaire</option>{data.beneficiaries.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select name="serviceId" aria-label="Prestation" required><option value="">Prestation</option>{data.services.map(s=><option key={s.id} value={s.id}>{s.name} — {(s.hourly_cents/100).toFixed(2)} €/h</option>)}</select><input name="startsAt" type="datetime-local" aria-label="Début" required/><input name="endsAt" type="datetime-local" aria-label="Fin" required/><button>Envoyer la demande</button></form></section>}
    <h2>Interventions</h2><ul>{data.visits.map(v=><li key={v.id}><strong>{v.service_name}</strong> — {new Date(v.starts_at).toLocaleString("fr-FR")} — {v.status}
      {v.validated_minutes!==null && <span> — {v.validated_minutes} min validées</span>}
      {v.status==="in_progress" && v.declared_minutes===null && <form onSubmit={e=>void send(e,{action:"report",visitId:v.id})}><label>Compte rendu <textarea name="report" required minLength={2} maxLength={5000} /></label><label>Durée en minutes <input name="minutes" type="number" min="0" max="1440" required /></label><button>Soumettre</button></form>}
    </li>)}</ul>
  </main>;
}
