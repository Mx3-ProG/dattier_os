"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type State = { customers: { id: string; name: string }[]; notes: { id: string; customer_id: string; body: string; author: string; created_at: string }[]; tags: { customer_id: string; tag: string }[] };

export function CustomerContext({ restaurant }: { restaurant: string }) {
  const [data, setData] = useState<State | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/customer-context`;
  useEffect(() => { void fetch(url).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Dossiers indisponibles."); setData(result); }).catch((cause) => setError((cause as Error).message)); }, [url]);
  async function perform(body: unknown) {
    setBusy(true); setError("");
    try { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Modification impossible."); setData(result); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="pilotage-addon" aria-label="Contexte client">
    <h2>Notes et étiquettes clients</h2>
    <p>Ajoutez des informations internes à la fiche d’un client. Elles ne sont pas envoyées au client.</p>
    {error && <p role="alert">{error}</p>}
    <label>Client <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Choisir un client</option>{data?.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
    {customerId && <>
      <div>{data?.tags.filter((item) => item.customer_id === customerId).map((item) => <span key={item.tag}>{item.tag} <button type="button" disabled={busy} aria-label={`Retirer ${item.tag}`} onClick={() => void perform({ action: "remove-tag", customerId, tag: item.tag })}>×</button> </span>)}</div>
      <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const tag = (form.elements.namedItem("tag") as HTMLInputElement).value; void perform({ action: "tag", customerId, tag }); form.reset(); }}>
        <label>Étiquette <input name="tag" required maxLength={40} placeholder="Ex. VIP, fournisseur, prospect" /></label><Button disabled={busy}>Ajouter</Button>
      </form>
      <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value; void perform({ action: "note", customerId, body }); form.reset(); }}>
        <label>Note interne <textarea name="body" required maxLength={2000} /></label><Button disabled={busy}>Ajouter la note</Button>
      </form>
      <ul>{data?.notes.filter((note) => note.customer_id === customerId).map((note) => <li key={note.id}>{note.body} · {note.author} · {new Date(note.created_at).toLocaleString("fr-FR")}</li>)}</ul>
    </>}
  </section>;
}
