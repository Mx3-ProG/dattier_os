"use client";
import { useEffect, useState, useCallback } from "react";
import type { billingAccount, billingInvoices } from "@/features/platform/billing-account";

type State = Awaited<ReturnType<typeof billingAccount>>;
type Invoice = Awaited<ReturnType<typeof billingInvoices>>["invoices"][number];
const money=(value:number,currency="eur")=>new Intl.NumberFormat("fr-FR",{style:"currency",currency}).format(value/100);
const date=(value:string|number|null)=>value?new Date(typeof value==="number"?value*1000:value).toLocaleDateString("fr-FR",{dateStyle:"long",timeZone:"Europe/Paris"}):"Non prévue";
const labels:Record<string,string>={paid:"Payé",open:"À régler",draft:"Brouillon",void:"Annulé",uncollectible:"Impayé",active:"Actif",trialing:"Essai avec carte",past_due:"Paiement à régulariser",canceled:"Résilié",cancelled:"Résilié",pending:"En attente",none:"Non souscrit",refunded:"Remboursé",expired:"Expiré",failed:"Échec",disputed:"Contesté",dispute_lost:"Litige perdu",duplicate:"Doublon",unpaid:"Impayé",incomplete:"Paiement incomplet",incomplete_expired:"Expiré",paused:"Suspendu"};
export function BillingAccount({organization,name,onChanged}:{organization:string;name:string;onChanged:()=>Promise<void>}) {
  const [state,setState]=useState<State>();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [page,setPage]=useState(0);
  const [quantity,setQuantity]=useState(2);
  const [source,setSource]=useState("plan");
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [next,setNext]=useState<string|null>(null);
  const [invoiceError,setInvoiceError]=useState("");
  const [invoiceBusy,setInvoiceBusy]=useState(false);
  const load=useCallback(async()=>{
    const r=await fetch(`/api/platform/billing?organization=${encodeURIComponent(organization)}&page=${page}`);
    const data=await r.json();
    if(!r.ok) throw new Error(data.error?.message||"Facturation indisponible.");
    setState(data);setQuantity(Math.max(2,(data.subscription?.quantity??data.capacity.seats)+1));
  },[organization,page]);
  useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
  useEffect(()=>{
    let active=true;
    setInvoices([]);setNext(null);setInvoiceError("");setInvoiceBusy(true);
    void fetch(`/api/platform/billing?organization=${encodeURIComponent(organization)}&source=${encodeURIComponent(source)}`)
      .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Factures indisponibles.");return d;})
      .then(d=>{if(active){setInvoices(d.invoices);setNext(d.next);}})
      .catch(e=>{if(active)setInvoiceError(e.message);}).finally(()=>{if(active)setInvoiceBusy(false);});
    return()=>{active=false;};
  },[organization,source]);
  async function moreInvoices(){
    if(!next||invoiceBusy)return;setInvoiceBusy(true);setInvoiceError("");
    try{const r=await fetch(`/api/platform/billing?organization=${encodeURIComponent(organization)}&source=${encodeURIComponent(source)}&cursor=${next}`);
      const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Factures indisponibles.");
      setInvoices(old=>[...old,...d.invoices]);setNext(d.next);
    }catch(e){setInvoiceError((e as Error).message);}finally{setInvoiceBusy(false);}
  }
  async function action(action:"checkout"|"portal"|"capacity"|"cancelSubscription"){
    if(action==="cancelSubscription"&&!window.confirm("Arrêter le renouvellement ? Votre accès reste disponible jusqu’à la fin de la période en cours. Les add-ons se gèrent séparément."))return;
    setBusy(true);setError("");
    try{
      const r=await fetch(action==="cancelSubscription"?"/api/platform":"/api/platform/billing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,organization,...(action==="capacity"?{quantity}:{})})});
      const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Opération impossible.");
      if(d.url)window.location.assign(d.url);else{await load();await onChanged();}
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const sub=state?.subscription;
  return <section className="billing-account" aria-label={`Abonnements et achats — ${name}`}>
    <h3>{name}</h3>
    {error&&<p role="alert" className="error">{error}</p>}
    {!state?<p>Chargement de la facturation…</p>:<>
      {!state.ready&&<p role="status">Le paiement en ligne n’est pas encore disponible. Aucun prélèvement automatique n’est activé.</p>}
      {state.ready&&!state.live&&<p role="status">Mode test Stripe — aucun paiement réel.</p>}
      {state.warning&&<p role="status">{state.warning}</p>}
      <div className="billing-metrics">
        <div><small>Abonnement Studio</small><strong>{labels[sub?.status??state.context.status]??"État à vérifier"}</strong></div>
        <div><small>Places d’établissement</small><strong>{state.capacity.occupied} utilisées / {state.capacity.seats} activées</strong></div>
        <div><small>{sub?.cancelling?"Fin d’accès":"Prochaine échéance"}</small><strong>{date(sub?.status==="trialing"?sub.trialEnd:sub?.periodEnd??null)}</strong></div>
        <div><small>Prochaine facture estimée</small><strong>{state.upcoming?money(state.upcoming.amount,state.upcoming.currency):sub?.cancelling?"Renouvellement arrêté":"Non disponible"}</strong></div>
      </div>
      {sub&&<p>Tarif récurrent : {money(sub.unitAmount*sub.quantity,sub.currency)} / mois avant réductions éventuelles. Les add-ons sont facturés séparément.</p>}
      {sub?.status==="trialing"&&<p>Carte enregistrée. Aucun prélèvement avant le {date(sub.trialEnd)}. Vous pouvez résilier avant cette date.</p>}
      {sub?.pendingUpdate&&<p role="status">Modification en attente de paiement. Les places supplémentaires seront activées après confirmation.</p>}
      <div className="actions">
        {state.ready&&!sub&&!state.context.hasCustomer&&<button disabled={busy} onClick={()=>void action("checkout")}>Activer mon abonnement · 39 € TTC / mois</button>}
        {state.ready&&state.context.hasCustomer&&<button disabled={busy} onClick={()=>void action("portal")}>Carte bancaire, factures et abonnement</button>}
        {state.ready&&sub&&["active","trialing","past_due"].includes(sub.status)&&!sub.cancelling&&<button disabled={busy} onClick={()=>void action("cancelSubscription")}>Résilier à la fin de la période</button>}
      </div>
      {state.ready&&sub?.status==="active"&&!sub.cancelling&&!sub.pendingUpdate&&<form onSubmit={e=>{e.preventDefault();void action("capacity");}}>
        <h4>Ajouter des établissements à mon abonnement</h4>
        <label>Nombre total de places<input type="number" min={sub.quantity+1} max={100} required value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>
        <p>{money(quantity*3900)} TTC / mois avant réductions. Stripe affiche le montant exact et le prorata avant votre confirmation. Chaque place permet de créer un établissement.</p>
        <button disabled={busy}>Voir le montant et confirmer sur Stripe</button>
      </form>}
      <h4>Mes add-ons mensuels</h4>
      {!state.addons.length?<p>Aucun abonnement à un add-on enregistré.</p>:<ul className="billing-list">{state.addons.map(a=><li key={a.id}><strong>{a.label} · {a.restaurant}</strong><span>{labels[a.status]??a.status} · {a.renewal_cancelled?"Fin d’accès":"Échéance"} : {date(a.valid_until)}</span><a href={`/dashboard?restaurant=${encodeURIComponent(a.restaurant_id)}&module=addons`}>Gérer cet add-on</a></li>)}</ul>}
      <h4>Factures et paiements des abonnements</h4>
      <label>Abonnement<select value={source} onChange={e=>setSource(e.target.value)}><option value="plan">Abonnement Studio — toutes les factures du compte</option>{state.addons.map(a=><option key={a.id} value={a.id}>{a.label} · {a.restaurant}</option>)}</select></label>
      {invoiceError&&<p role="alert">{invoiceError}</p>}
      {invoiceBusy&&!invoices.length?<p>Chargement des factures…</p>:!invoices.length&&!invoiceError&&<p>Aucune facture disponible pour cet abonnement.</p>}
      <ul className="billing-list">{invoices.map(i=><li key={i.id}><strong>{i.number||"Facture"} · {date(i.date)}</strong><span>{labels[i.status??""]??i.status} · {money(i.amount,i.currency)} · réglé : {money(i.paid,i.currency)}</span><div className="actions">{i.url&&<a href={i.url} target="_blank" rel="noopener noreferrer">Voir la facture</a>}{i.pdf&&<a href={i.pdf} target="_blank" rel="noopener noreferrer">Télécharger le PDF</a>}</div></li>)}</ul>
      {next&&<button disabled={invoiceBusy} onClick={()=>void moreInvoices()}>Charger les factures précédentes</button>}
      <h4>Achats ponctuels et recharges</h4>
      {!state.purchases.length?<p>Aucun achat enregistré sur cette page.</p>:<ul className="billing-list">{state.purchases.map(p=><li key={p.id}><strong>{p.label} · {p.restaurant}</strong><span>{date(p.created_at)} · {money(p.amount,p.currency)} · {labels[p.status]??p.status}{p.refunded>0?` · remboursé : ${money(p.refunded,p.currency)}`:""}</span></li>)}</ul>}
      <div className="actions"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Achats plus récents</button><span>Page {page+1}</span><button disabled={!state.morePurchases} onClick={()=>setPage(p=>p+1)}>Achats plus anciens</button></div>
    </>}
  </section>;
}
