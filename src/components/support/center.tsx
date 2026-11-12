"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Case = { id: string; customer_id: string; order_id: string | null; category: string; subject: string; description: string; status: "open" | "in_progress" | "resolved" | "closed"; resolution: string; assigned_to: string | null };
type State = { cases: Case[]; events: { id: string; case_id: string; kind: string; detail: string; actor_name: string; created_at: string }[]; customers: { id: string; name: string }[]; orders: { order_id: string; customer_id: string; number: number }[]; assignees: { id: string; name: string }[] };
const categories = { question: "Question", return: "Retour", exchange: "Échange", warranty: "Garantie" } as const;

export function SupportCenter({ restaurant }: { restaurant: string }) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [category, setCategory] = useState<keyof typeof categories>("question");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/support`;
  useEffect(() => { void fetch(url).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Service indisponible."); setData(result); }).catch((cause) => setError((cause as Error).message)); }, [url]);
  async function perform(action: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Opération indisponible.");
      setData(result);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="pilotage-addon" aria-label="Service après-vente">
    <h2>Service après-vente</h2>
    <p>Suivez les questions, retours, échanges et garanties. Aucun remboursement ni mouvement de stock n’est déclenché ici.</p>
    {error && <p role="alert">{error}</p>}
    <form className="pilotage-addon-form" onSubmit={(event) => { event.preventDefault(); void perform({ action: "create", customerId, orderId: orderId || undefined, category, subject, description }); }}>
      <label>Client <select required value={customerId} onChange={(event) => { setCustomerId(event.target.value); setOrderId(""); }}><option value="">Choisir</option>{data?.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label>Commande <select value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Sans commande</option>{data?.orders.filter((order) => order.customer_id === customerId).map((order) => <option key={order.order_id} value={order.order_id}>N° {order.number}</option>)}</select></label>
      <label>Type <select value={category} onChange={(event) => setCategory(event.target.value as keyof typeof categories)}>{Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Objet <input required maxLength={180} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label>Description <textarea required maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <Button disabled={busy}>Ouvrir le dossier</Button>
    </form>
    {data?.cases.map((item) => <article className="pilotage-addon-card" key={item.id}>
      <h3>{item.subject}</h3><p>{categories[item.category as keyof typeof categories]} · {data.customers.find((customer) => customer.id === item.customer_id)?.name} · {item.status}</p>
      <p>{item.description}</p>
      <label>Responsable <select value={item.assigned_to ?? ""} disabled={busy || item.status === "closed"} onChange={(event) => void perform({ action: "assign", id: item.id, profileId: event.target.value || null })}><option value="">Non attribué</option>{data.assignees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <form key={`${item.id}-${item.status}-${item.resolution}`} onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void perform({ action: "update", id: item.id, status: (form.elements.namedItem("status") as HTMLSelectElement).value, resolution: (form.elements.namedItem("resolution") as HTMLTextAreaElement).value }); }}>
        <label>Statut <select name="status" defaultValue={item.status} disabled={item.status === "closed"}><option value="open">Ouvert</option><option value="in_progress">En cours</option><option value="resolved">Résolu</option><option value="closed">Clos</option></select></label>
        <label>Résolution <textarea name="resolution" maxLength={5000} defaultValue={item.resolution} readOnly={item.status === "closed"} /></label>
        {item.status !== "closed" && <Button disabled={busy}>Enregistrer</Button>}
      </form>
      <details><summary>Historique du dossier</summary>
        <ul>{data.events.filter((entry) => entry.case_id === item.id).map((entry) => <li key={entry.id}>{new Date(entry.created_at).toLocaleString("fr-FR")} · {entry.actor_name} · {entry.detail}</li>)}</ul>
        {item.status !== "closed" && <form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("note") as HTMLTextAreaElement; void perform({ action: "note", id: item.id, text: input.value }); input.value = ""; }}>
          <label>Note interne <textarea name="note" required maxLength={2000} /></label>
          <Button disabled={busy}>Ajouter la note</Button>
        </form>}
      </details>
    </article>)}
  </section>;
}
