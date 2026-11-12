"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Review = { id: string; product: string; customer: string; rating: number; body: string; status: "pending" | "published" | "rejected" | "archived"; admin_reply: string; verified_purchase: boolean; created_at: string };
type State = { metrics: { total: number; pending: number; awaiting_reply: number; verified: number; average_rating: number | null }; reviews: Review[] };
const labels = { pending: "En attente", published: "Publié", rejected: "Refusé", archived: "Archivé" };

export function ReputationCenter({ restaurant }: { restaurant: string }) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/reputation`;
  useEffect(() => { void fetch(url).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Avis indisponibles."); setData(result); }).catch((cause) => setError((cause as Error).message)); }, [url]);
  async function moderate(id: string, status: Review["status"], reply: string) {
    if (status === "pending") return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status, reply }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Modification impossible.");
      setData(result);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="pilotage-addon" aria-label="Avis clients">
    <h2>Avis clients</h2>
    <p>Validez les avis et répondez publiquement aux clients.</p>
    {error && <p role="alert">{error}</p>}
    {data && <div className="pilotage-addon-summary"><strong>{data.metrics.pending} en attente</strong><span>{data.metrics.awaiting_reply} sans réponse · {data.metrics.total} publiés · note moyenne {data.metrics.average_rating?.toLocaleString("fr-FR") ?? "—"}/5</span></div>}
    {data?.reviews.length === 0 && <p>Aucun avis pour le moment.</p>}
    {data?.reviews.map((review) => <article className="pilotage-addon-card" key={review.id}>
      <h3>{review.product} · {review.rating}/5</h3>
      <p>{review.customer} · {labels[review.status]}{review.verified_purchase ? " · Achat vérifié" : ""} · {new Date(review.created_at).toLocaleDateString("fr-FR")}</p>
      <p>{review.body}</p>
      <form key={`${review.id}-${review.admin_reply}-${review.status}`} onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const reply = (form.elements.namedItem("reply") as HTMLTextAreaElement).value; const status = (form.elements.namedItem("status") as HTMLSelectElement).value as Review["status"]; void moderate(review.id, status, reply); }}>
        <label>Statut <select name="status" defaultValue={review.status === "pending" ? "published" : review.status}><option value="published">Publier</option><option value="rejected">Refuser</option><option value="archived">Archiver</option></select></label>
        <label>Réponse publique <textarea name="reply" maxLength={1000} defaultValue={review.admin_reply} /></label>
        <Button disabled={busy}>Enregistrer</Button>
      </form>
    </article>)}
  </section>;
}
