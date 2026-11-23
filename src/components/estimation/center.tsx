"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EstimationCalculator } from "./calculator";
import { cents, estimationSaveSchema, type EstimationItem, type EstimationSave } from "@/domain/estimation/model";
import "./estimation.css";

type State = {
  config: { title: string; introduction: string; items: EstimationItem[]; fixed_costs_cents: number; published: boolean; revision: number };
  menu: { id: string; name: string; price_cents: number; cost_cents: number | null }[];
  publicPath: string;
  websiteAvailable: boolean;
};
const euros = (centsValue: number | null) => centsValue === null ? "" : (centsValue / 100).toString();
const toCents = (value: string) => value.trim() === "" ? null : Math.round(Number(value.replace(",", ".")) * 100);

export function EstimationCenter({ restaurant }: { restaurant: string }) {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<EstimationSave | null>(null);
  const [menuId, setMenuId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/estimation`;
  useEffect(() => {
    let alive = true;
    fetch(url).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Estimation indisponible.");
      if (!alive) return;
      setState(data);
      setDraft({ title: data.config.title, introduction: data.config.introduction,
        items: data.config.items, fixedCostsCents: data.config.fixed_costs_cents,
        published: data.config.published, revision: data.config.revision });
    }).catch((reason) => { if (alive) setError((reason as Error).message); });
    return () => { alive = false; };
  }, [url]);
  const patch = (change: Partial<EstimationSave>) => setDraft((current) => current && ({ ...current, ...change }));
  const changeItem = (id: string, change: Partial<EstimationItem>) =>
    draft && patch({ items: draft.items.map((item) => item.id === id ? { ...item, ...change } : item) });
  const addItem = (item?: State["menu"][number]) => draft && patch({ items: [...draft.items, {
    id: crypto.randomUUID(), kind: item ? "product" : "service",
    name: item?.name ?? "", unit: "unité", priceCents: item?.price_cents ?? 0,
    costCents: item?.cost_cents ?? null, defaultQuantity: 1, maxQuantity: 100,
    featured: false,
  }] });
  const save = async () => {
    if (!draft) return;
    const parsed = estimationSaveSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Configuration invalide."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Enregistrement impossible.");
      setState(data);
      patch({ revision: data.config.revision });
      setNotice("Estimation enregistrée pour cet établissement.");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  if (!draft || !state) return <p role={error ? "alert" : "status"}>{error || "Chargement de l’estimation…"}</p>;
  return <div className="estimation-shell">
    <section className="estimation-hero">
      <small>ADD-ON · PILOTAGE</small><h2>Simulateur et prévisions</h2>
      <p>Créez un scénario de produits et services. Les visiteurs voient un prix indicatif ; vous voyez aussi les coûts et la marge selon les hypothèses renseignées.</p>
    </section>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="card estimation-editor" aria-label="Configurer l’estimation">
      <h2>Votre scénario</h2>
      <label>Titre public<input value={draft.title} maxLength={100} onChange={(event) => patch({ title: event.target.value })} /></label>
      <label>Présentation<textarea value={draft.introduction} maxLength={500} rows={3} onChange={(event) => patch({ introduction: event.target.value })} /></label>
      <div className="estimation-editor-actions">
        <Button variant="secondary" onClick={() => addItem()} disabled={draft.items.length >= 20}>Ajouter un service</Button>
        <Button variant="secondary" onClick={() => draft && patch({ items: [...draft.items, { id: crypto.randomUUID(), kind: "product", name: "", unit: "unité", priceCents: 0, costCents: null, defaultQuantity: 1, maxQuantity: 100, featured: false }] })} disabled={draft.items.length >= 20}>Ajouter un produit</Button>
      </div>
      {state.menu.length > 0 && <div className="estimation-editor-actions">
        <label>Importer un produit du catalogue<select value={menuId} onChange={(event) => setMenuId(event.target.value)}><option value="">Choisir…</option>{state.menu.map((item) => <option key={item.id} value={item.id}>{item.name} · {cents(item.price_cents)}</option>)}</select></label>
        <Button variant="secondary" disabled={!menuId || draft.items.length >= 20} onClick={() => { const item = state.menu.find((entry) => entry.id === menuId); if (item) addItem(item); setMenuId(""); }}>Importer</Button>
      </div>}
      {draft.items.map((item, index) => <div className="estimation-editor-row" key={item.id}>
        <div className="estimation-editor-actions"><strong>{index + 1}. {item.kind === "service" ? "Service" : "Produit"}</strong><Button variant="secondary" onClick={() => patch({ items: draft.items.filter((entry) => entry.id !== item.id) })}>Retirer</Button></div>
        <div className="estimation-editor-grid">
          <label>Nom<input value={item.name} maxLength={80} onChange={(event) => changeItem(item.id, { name: event.target.value })} /></label>
          <label>Unité<input value={item.unit} maxLength={24} onChange={(event) => changeItem(item.id, { unit: event.target.value })} /></label>
          <label>Type<select value={item.kind} onChange={(event) => changeItem(item.id, { kind: event.target.value as EstimationItem["kind"] })}><option value="product">Produit</option><option value="service">Service</option></select></label>
          <label>Prix public (€)<input type="number" min="0" step="0.01" value={euros(item.priceCents)} onChange={(event) => changeItem(item.id, { priceCents: toCents(event.target.value) ?? 0 })} /></label>
          <label>Coût unitaire estimé (€)<input type="number" min="0" step="0.01" placeholder="Non renseigné" value={euros(item.costCents)} onChange={(event) => changeItem(item.id, { costCents: toCents(event.target.value) })} /></label>
          <label>Quantité initiale<input type="number" min="0" max={item.maxQuantity} step="1" value={item.defaultQuantity} onChange={(event) => changeItem(item.id, { defaultQuantity: Number(event.target.value) })} /></label>
          <label>Quantité maximale<input type="number" min="1" max="10000" step="1" value={item.maxQuantity} onChange={(event) => changeItem(item.id, { maxQuantity: Number(event.target.value) })} /></label>
          <label><input type="checkbox" checked={item.featured} onChange={(event) => patch({ items: draft.items.map((entry) => ({ ...entry, featured: entry.id === item.id ? event.target.checked : false })) })} /> Mettre en avant</label>
        </div>
      </div>)}
      <label>Autres coûts prévus pour ce scénario (€)<input type="number" min="0" step="0.01" value={euros(draft.fixedCostsCents)} onChange={(event) => patch({ fixedCostsCents: toCents(event.target.value) ?? 0 })} /></label>
      <label><input type="checkbox" checked={draft.published} disabled={!state.websiteAvailable} onChange={(event) => patch({ published: event.target.checked })} /> Publier le simulateur sur le site</label>
      {!state.websiteAvailable && <p>Installez l’add-on Site internet pour publier la page. L’analyse interne reste utilisable.</p>}
      <div className="estimation-editor-actions"><Button disabled={busy} onClick={() => void save()}>Enregistrer</Button>{state.config.published && <a href={state.publicPath} target="_blank" rel="noreferrer">Voir la page publique ↗</a>}</div>
      <p>Les montants sont des hypothèses propres à ce scénario. Un produit importé copie son prix et son coût connus au moment de l’import ; vérifiez-les avant publication.</p>
    </section>
    {draft.items.length > 0 && <section aria-label="Aperçu de l’estimation interne"><h2>Analyse du scénario</h2>
      {draft.items.every((item) => Number.isInteger(item.defaultQuantity) && item.defaultQuantity >= 0 && item.defaultQuantity <= item.maxQuantity)
        ? <EstimationCalculator items={draft.items} fixedCostsCents={draft.fixedCostsCents} internal />
        : <p>Corrigez les quantités initiales pour afficher l’aperçu.</p>}
    </section>}
  </div>;
}
