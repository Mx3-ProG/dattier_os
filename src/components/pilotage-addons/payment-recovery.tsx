"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type State = { summary: { count: number; amount_cents: number }; orders: { order_id: string; number: number; total: number; created_at: string; customer_name: string; contact: string; contact_consent: boolean | null; account_consent: boolean; followup_status: "reviewed" | "contacted" | null; followup_channel: "email" | "phone" | "other" | null; followup_note: string | null; followup_at: string | null }[] };
const money = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export function PaymentRecovery({ restaurant }: { restaurant: string }) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/pilotage/crm/payment-recovery`;
  useEffect(() => { void fetch(url).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Suivi indisponible."); setData(result); }).catch((cause) => setError((cause as Error).message)); }, [url]);
  async function record(orderId: string, status: "reviewed" | "contacted", channel: "email" | "phone" | "other" | null, note: string) {
    setBusy(true); setError("");
    try { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, status, channel, note }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Suivi indisponible."); setData(result); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="pilotage-addon" aria-label="Paiements non finalisés">
    <h2>Paiements en ligne non finalisés</h2>
    <p>Commandes avec session de paiement créée, sans paiement confirmé après 30 minutes, sur les 30 derniers jours. Un panier quitté avant validation n’apparaît pas ici.</p>
    {error && <p role="alert">{error}</p>}
    {data && <p><strong>{data.summary.count}</strong> commandes · {money(data.summary.amount_cents)} en jeu, non encaissés. Vérifiez le statut du paiement avant toute prise de contact.</p>}
    {data?.orders.map((order) => <article className="pilotage-addon-card" key={order.order_id}>
      <h3>Commande n° {order.number} · {money(order.total)}</h3>
      <p>{order.customer_name || "Client non identifié"} · {new Date(order.created_at).toLocaleString("fr-FR")}</p>
      <p>{order.contact || "Aucun contact"} · {order.contact_consent || order.account_consent ? "Accord marketing enregistré" : "Aucun accord marketing enregistré"}</p>
      {order.followup_status && <p>Suivi : {order.followup_status === "contacted" ? "Contacté" : "Vérifié"}{order.followup_channel ? ` · ${order.followup_channel}` : ""}{order.followup_at ? ` · ${new Date(order.followup_at).toLocaleString("fr-FR")}` : ""}</p>}
      <form key={`${order.order_id}-${order.followup_status}-${order.followup_note}`} className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const status = (form.elements.namedItem("status") as HTMLSelectElement).value as "reviewed" | "contacted"; const channel = (form.elements.namedItem("channel") as HTMLSelectElement).value as "email" | "phone" | "other" | ""; const note = (form.elements.namedItem("note") as HTMLTextAreaElement).value; void record(order.order_id, status, channel || null, note); }}>
        <label>Suivi <select name="status" defaultValue={order.followup_status ?? "reviewed"}><option value="reviewed">Dossier vérifié</option><option value="contacted">Client contacté</option></select></label>
        <label>Canal <select name="channel" defaultValue={order.followup_channel ?? ""}><option value="">Aucun</option><option value="email">E-mail</option><option value="phone">Téléphone</option><option value="other">Autre</option></select></label>
        <label>Note interne <textarea name="note" maxLength={1000} defaultValue={order.followup_note ?? ""} /></label>
        <Button disabled={busy}>Enregistrer le suivi</Button>
      </form>
    </article>)}
    {data && data.summary.count > data.orders.length && <p>Les 200 commandes les plus récentes sont affichées.</p>}
  </section>;
}
