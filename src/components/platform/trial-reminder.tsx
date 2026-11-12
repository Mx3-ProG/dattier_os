"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Modal } from "@/components/forms";
export function TrialReminder() {
  const path=usePathname();
  const [organization,setOrganization]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const eligible=/^\/(platform|dashboard|restaurant)(\/|$)/.test(path);
  useEffect(()=>{
    if(!eligible)return;
    let active=true;
    const check=async()=>{
      if(document.visibilityState!=="visible")return;
      try{const r=await fetch("/api/platform/billing/reminder",{method:"POST"});
        if(r.ok){const d=await r.json();if(active&&d.organization)setOrganization(d.organization);}
      }catch{/* A reminder never prevents work when the network is offline. */}
    };
    void check();const timer=setInterval(()=>void check(),60_000);
    document.addEventListener("visibilitychange",check);
    return()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",check);};
  },[eligible]);
  async function checkout(){
    setBusy(true);setError("");
    try{const r=await fetch("/api/platform/billing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"checkout",organization})});
      const d=await r.json();if(!r.ok||!d.url)throw new Error(d.error?.message||"Paiement indisponible.");window.location.assign(d.url);
    }catch(e){setError((e as Error).message);setBusy(false);}
  }
  if(!organization||!eligible)return null;
  return <Modal title="Vous avez aimé votre version gratuite ?" description="Votre essai de sept jours est terminé. Il est temps de choisir votre abonnement Studio pour continuer." close={()=>setOrganization(null)}>
    <p>39 € TTC par mois, hors add-ons. Stripe affiche la date du premier prélèvement et les éventuelles réductions avant votre confirmation.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="actions"><button disabled={busy} onClick={()=>void checkout()}>M’abonner sur Stripe</button><button disabled={busy} onClick={()=>setOrganization(null)}>Payer plus tard</button></div>
  </Modal>;
}
