"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { tradeTool, type TradeEntity, type TradeField, type TradeTool } from "@/features/trade/definitions";
import { quoteTotals, shippingQuote, vatRates, type QuoteLine } from "@/features/trade/model";
import "./trade.css";

type Tone = "good" | "warn" | "bad" | "neutral";
type Panel =
  | { type: "kpis"; items: { label: string; value: string; hint?: string; tone?: Tone }[] }
  | { type: "bars"; title: string; items: { label: string; value: number; display: string; tone?: Tone }[]; empty?: string }
  | { type: "table"; title: string; columns: string[]; rows: string[][]; empty?: string }
  | { type: "timeline"; title: string; items: { label: string; group: string; start: string; end: string; tone: Tone }[]; empty?: string }
  | { type: "note"; text: string; tone?: Tone };
type RecordRow = { id: string; entity: string; data: Record<string, unknown>; created_at: string };
type Option = { value: string; label: string };
type ToolState = {
  tool: string;
  records: RecordRow[];
  sources: Partial<Record<string, Option[]>>;
  panels: Panel[];
  extra?: Record<string, unknown>;
};
type Act = (action: Record<string, unknown>) => Promise<unknown> | void;

/** Une attente longue reste lisible : « 13 h 31 » plutôt que « 811 min ». */
export const formatWait = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
const euro = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const api = (restaurant: string, tool?: string) =>
  `/api/restaurants/${encodeURIComponent(restaurant)}/trade${tool ? `/${encodeURIComponent(tool)}` : ""}`;
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Opération indisponible.");
  return body as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function display(field: TradeField, value: unknown, state: ToolState): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "money") return euro(Number(value));
  if (field.type === "percent") return `${value} %`;
  if (field.type === "boolean") return value ? "Oui" : "Non";
  if (field.type === "date") return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR");
  if (field.type === "datetime") return new Date(String(value)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  if (field.type === "lines") return `${(value as unknown[]).length} poste(s)`;
  if (field.type === "ref") {
    const target = state.records.find((record) => record.id === value);
    const entity = tradeTool(state.tool)?.entities.find((entry) => entry.id === field.ref);
    return target && entity ? String(target.data[entity.title] ?? "—") : "Fiche retirée";
  }
  if (field.source) {
    const options = state.sources[field.source] ?? [];
    const label = (entry: unknown) => options.find((option) => option.value === entry)?.label ?? String(entry);
    return Array.isArray(value) ? value.map(label).join(", ") : label(value);
  }
  return String(value);
}

function Panels({ panels }: { panels: Panel[] }) {
  return (
    <div className="trade-panels">
      {panels.map((panel, index) => {
        if (panel.type === "note") return <p key={index} className={`trade-note is-${panel.tone ?? "neutral"}`}>{panel.text}</p>;
        if (panel.type === "kpis")
          return (
            <div key={index} className="trade-kpis">
              {panel.items.map((item) => (
                <div key={item.label} className={`card trade-kpi is-${item.tone ?? "neutral"}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  {item.hint && <small>{item.hint}</small>}
                </div>
              ))}
            </div>
          );
        if (panel.type === "bars") {
          const max = Math.max(1, ...panel.items.map((item) => item.value));
          return (
            <section key={index} className="card trade-panel" aria-label={panel.title}>
              <h3>{panel.title}</h3>
              {panel.items.length === 0 || panel.items.every((item) => item.value === 0) ? (
                <p className="trade-empty">{panel.empty ?? "Pas encore de données."}</p>
              ) : (
                <ul className="trade-bars">
                  {panel.items.map((item) => (
                    <li key={item.label}>
                      <span>{item.label}</span>
                      <span className="trade-bar-track"><span className={`trade-bar is-${item.tone ?? "neutral"}`} style={{ width: `${(item.value / max) * 100}%` }} /></span>
                      <b>{item.display}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        }
        if (panel.type === "timeline") {
          const dates = panel.items.flatMap((item) => [Date.parse(item.start), Date.parse(item.end)]).filter(Number.isFinite);
          const from = Math.min(...dates);
          const span = Math.max(86_400_000, Math.max(...dates) + 86_400_000 - from);
          return (
            <section key={index} className="card trade-panel" aria-label={panel.title}>
              <h3>{panel.title}</h3>
              {panel.items.length === 0 ? <p className="trade-empty">{panel.empty}</p> : (
                <ul className="trade-timeline">
                  {panel.items.map((item, position) => (
                    <li key={`${item.label}-${position}`}>
                      <span className="trade-timeline-label"><small>{item.group}</small>{item.label}</span>
                      <span className="trade-bar-track">
                        <span className={`trade-bar is-${item.tone}`} style={{
                          marginLeft: `${((Date.parse(item.start) - from) / span) * 100}%`,
                          width: `${Math.max(2, ((Date.parse(item.end) + 86_400_000 - Date.parse(item.start)) / span) * 100)}%`,
                        }} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        }
        return (
          <section key={index} className="card trade-panel" aria-label={panel.title}>
            <h3>{panel.title}</h3>
            {panel.rows.length === 0 ? <p className="trade-empty">{panel.empty ?? "Rien à afficher."}</p> : (
              <div className="trade-table">
                <table>
                  <thead><tr>{panel.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                  <tbody>{panel.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LinesEditor({ value, onChange }: { value: QuoteLine[]; onChange: (lines: QuoteLine[]) => void }) {
  const update = (index: number, patch: Partial<QuoteLine>) => onChange(value.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  const totals = quoteTotals(value);
  return (
    <div className="trade-lines">
      {value.map((line, index) => (
        <div className="trade-line" key={index}>
          <input aria-label="Désignation" placeholder="Désignation" value={line.label} onChange={(event) => update(index, { label: event.target.value })} />
          <input aria-label="Quantité" type="number" min={0} step="any" value={line.quantity} onChange={(event) => update(index, { quantity: Number(event.target.value) })} />
          <input aria-label="Unité" placeholder="m², h, u" value={line.unit} onChange={(event) => update(index, { unit: event.target.value })} />
          <input aria-label="Prix unitaire HT (€)" type="number" min={0} step="0.01" value={line.unitPrice / 100} onChange={(event) => update(index, { unitPrice: Math.round(Number(event.target.value) * 100) })} />
          <select aria-label="TVA" value={line.vat} onChange={(event) => update(index, { vat: Number(event.target.value) })}>
            {vatRates.map((rate) => <option key={rate} value={rate}>{rate} %</option>)}
          </select>
          <button type="button" className="text-button" onClick={() => onChange(value.filter((_, position) => position !== index))}>Retirer</button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...value, { label: "", quantity: 1, unit: "u", unitPrice: 0, vat: 20 }])}>Ajouter un poste</Button>
      <p className="trade-totals">Total HT {euro(totals.net)} · TVA {euro(totals.vat)} · <b>TTC {euro(totals.gross)}</b></p>
    </div>
  );
}

function RecordForm({ entity, state, initial, busy, onSubmit, onCancel }: {
  entity: TradeEntity;
  state: ToolState;
  initial?: Record<string, unknown>;
  busy: boolean;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initial ?? {});
  const set = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    const data: Record<string, unknown> = {};
    for (const field of entity.fields) {
      const value = values[field.key];
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
      data[field.key] = value;
    }
    onSubmit(data);
  }
  return (
    <form className="trade-form" onSubmit={submit}>
      {entity.fields.map((field) => {
        const value = values[field.key];
        const id = `${entity.id}-${field.key}`;
        const options: Option[] = field.options
          ? field.options.map((option) => ({ value: option, label: option }))
          : field.source
            ? (state.sources[field.source] ?? [])
            : field.ref
              ? refOptions(state, field.ref)
              : [];
        if (field.type === "lines")
          return (
            <fieldset key={field.key} className="trade-wide">
              <legend>{field.label}{field.required ? " *" : ""}</legend>
              <LinesEditor value={(value as QuoteLine[]) ?? []} onChange={(lines) => set(field.key, lines)} />
            </fieldset>
          );
        if (field.type === "boolean")
          return (
            <label key={field.key} className="trade-check">
              <input type="checkbox" checked={value === true} onChange={(event) => set(field.key, event.target.checked)} />
              {field.label}
            </label>
          );
        if (field.type === "multiselect")
          return (
            <fieldset key={field.key} className="trade-wide">
              <legend>{field.label}{field.required ? " *" : ""}</legend>
              <div className="trade-multi">
                {options.length === 0 && <p className="trade-empty">Aucun choix disponible pour le moment.</p>}
                {options.map((option) => {
                  const list = (value as string[]) ?? [];
                  return (
                    <label key={option.value} className="trade-check">
                      <input type="checkbox" checked={list.includes(option.value)} onChange={(event) => set(field.key, event.target.checked ? [...list, option.value] : list.filter((entry) => entry !== option.value))} />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        return (
          <label key={field.key} htmlFor={id} className={field.type === "textarea" ? "trade-wide" : undefined}>
            {field.label}{field.required ? " *" : ""}
            {field.type === "select" || field.type === "ref" ? (
              <select id={id} required={field.required} value={String(value ?? "")} onChange={(event) => set(field.key, event.target.value || undefined)}>
                <option value="">Choisir…</option>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : field.type === "textarea" ? (
              <textarea id={id} required={field.required} rows={3} maxLength={3000} value={String(value ?? "")} onChange={(event) => set(field.key, event.target.value)} />
            ) : field.type === "money" ? (
              <input id={id} required={field.required} type="number" min={0} step="0.01" value={value === undefined ? "" : Number(value) / 100} onChange={(event) => set(field.key, event.target.value === "" ? undefined : Math.round(Number(event.target.value) * 100))} />
            ) : field.type === "number" || field.type === "percent" ? (
              <input id={id} required={field.required} type="number" step="any" min={field.min} max={field.max ?? (field.type === "percent" ? 100 : undefined)} value={value === undefined ? "" : String(value)} onChange={(event) => set(field.key, event.target.value === "" ? undefined : Number(event.target.value))} />
            ) : (
              <input id={id} required={field.required} type={field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"} maxLength={200} placeholder={field.placeholder}
                value={field.type === "datetime" && value ? toLocalInput(String(value)) : String(value ?? "")}
                onChange={(event) => set(field.key, field.type === "datetime" && event.target.value ? new Date(event.target.value).toISOString() : event.target.value)} />
            )}
          </label>
        );
      })}
      <div className="trade-actions trade-wide">
        <Button disabled={busy}>{initial ? "Enregistrer" : `Ajouter ${entity.label.toLowerCase()}`}</Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>}
      </div>
    </form>
  );
}
function refOptions(state: ToolState, ref: string): Option[] {
  const title = tradeTool(state.tool)?.entities.find((entry) => entry.id === ref)?.title ?? "";
  return state.records
    .filter((record) => record.entity === ref)
    .map((record) => ({ value: record.id, label: String(record.data[title] ?? "Fiche") }));
}
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EntitySection({ entity, state, busy, perform, onPrint }: {
  entity: TradeEntity;
  state: ToolState;
  busy: boolean;
  perform: (body: unknown, success: string) => Promise<boolean>;
  onPrint?: (record: RecordRow) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const list = state.records.filter((record) => record.entity === entity.id);
  const columns = entity.fields.filter((field) => field.list);
  if (entity.singleton) {
    const current = list[0];
    return (
      <section className="card trade-panel" aria-label={entity.plural}>
        <h3>{entity.plural}</h3>
        <RecordForm key={current?.id ?? "new"} entity={entity} state={state} initial={current?.data} busy={busy}
          onSubmit={(data) => void perform(current ? { action: "update", entity: entity.id, id: current.id, data } : { action: "create", entity: entity.id, data }, "Réglages enregistrés.")} />
      </section>
    );
  }
  return (
    <section className="card trade-panel" aria-label={entity.plural}>
      <div className="trade-section-head">
        <h3>{entity.plural} <small>({list.length})</small></h3>
        {!adding && <Button onClick={() => setAdding(true)}>Ajouter {entity.label.toLowerCase()}</Button>}
      </div>
      {adding && (
        <RecordForm entity={entity} state={state} busy={busy} onCancel={() => setAdding(false)}
          onSubmit={async (data) => { if (await perform({ action: "create", entity: entity.id, data }, `Fiche « ${entity.label} » enregistrée.`)) setAdding(false); }} />
      )}
      {list.length === 0 ? (
        !adding && <p className="trade-empty">Aucune fiche pour le moment.</p>
      ) : (
        <div className="trade-table">
          <table>
            <thead><tr>{columns.map((field) => <th key={field.key}>{field.label}</th>)}{entity.id === "quote" && <th>Total HT</th>}<th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map((record) => editing === record.id ? (
                <tr key={record.id}><td colSpan={columns.length + 2}>
                  <RecordForm entity={entity} state={state} initial={record.data} busy={busy} onCancel={() => setEditing(null)}
                    onSubmit={async (data) => { if (await perform({ action: "update", entity: entity.id, id: record.id, data }, "Fiche mise à jour.")) setEditing(null); }} />
                </td></tr>
              ) : (
                <tr key={record.id}>
                  {columns.map((field) => <td key={field.key}>{display(field, record.data[field.key], state)}</td>)}
                  {entity.id === "quote" && <td>{euro(quoteTotals((record.data.lines as QuoteLine[]) ?? []).net)}</td>}
                  <td className="trade-row-actions">
                    {onPrint && <button className="text-button" onClick={() => onPrint(record)}>Imprimer</button>}
                    <button className="text-button" onClick={() => setEditing(record.id)}>Modifier</button>
                    <button className="text-button" onClick={() => { if (window.confirm("Supprimer cette fiche ?")) void perform({ action: "archive", id: record.id }, "Fiche supprimée."); }}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type Ticket = { id: string; label: string; channel: string; minutes: number; items: { id: string; name: string; quantity: number; note: string; status: string }[] };
function KitchenBoard({ state, act, refresh }: { state: ToolState; act?: Act; refresh: () => Promise<void> }) {
  const board = useRef<HTMLDivElement>(null);
  const target = Number(state.extra?.target ?? 15);
  const tickets = (state.extra?.tickets as Ticket[]) ?? [];
  const move = async (id: string, status: string) => {
    await act?.({ action: "item", id, status });
    await refresh();
  };
  return (
    <section className="trade-kitchen" ref={board} aria-label="Bons en cuisine">
      <div className="trade-section-head">
        <h3>Bons en cours <small>· actualisation automatique</small></h3>
        <Button variant="secondary" onClick={() => void board.current?.requestFullscreen?.()}>Plein écran</Button>
      </div>
      {tickets.length === 0 ? <p className="trade-empty">Aucun bon en attente. La cuisine est à jour.</p> : (
        <div className="trade-tickets">
          {tickets.map((ticket) => {
            const tone = ticket.minutes > target ? "bad" : ticket.minutes > target * 0.7 ? "warn" : "good";
            return (
              <article key={ticket.id} className={`trade-ticket is-${tone}`} aria-label={ticket.label}>
                <header><b>{ticket.label}</b><span>{formatWait(ticket.minutes)}</span></header>
                <ul>
                  {ticket.items.map((item) => (
                    <li key={item.id} data-status={item.status}>
                      <span><b>{item.quantity}×</b> {item.name}{item.note && <small>{item.note}</small>}</span>
                      {item.status === "waiting" && <button onClick={() => void move(item.id, "preparing")}>Lancer</button>}
                      {item.status === "preparing" && <button onClick={() => void move(item.id, "ready")}>Prêt</button>}
                      {item.status === "ready" && <em>Prêt</em>}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

type AllergenItem = { id: string; name: string; raw: string; present: string[]; traces: string[] };
function AllergenMatrix({ state, busy, perform }: { state: ToolState; busy: boolean; perform: (body: unknown, success: string) => Promise<boolean> }) {
  const allergens = (state.extra?.allergens as string[]) ?? [];
  const [items, setItems] = useState(() => (state.extra?.items as AllergenItem[]) ?? []);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const cycle = (id: string, allergen: string) => {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const isPresent = item.present.includes(allergen);
      const isTrace = item.traces.includes(allergen);
      return isPresent
        ? { ...item, present: item.present.filter((entry) => entry !== allergen), traces: [...item.traces, allergen] }
        : isTrace
          ? { ...item, traces: item.traces.filter((entry) => entry !== allergen) }
          : { ...item, present: [...item.present, allergen] };
    }));
    setDirty((current) => new Set(current).add(id));
  };
  return (
    <section className="card trade-panel trade-print" aria-label="Grille des allergènes">
      <div className="trade-section-head">
        <h3>Grille des 14 allergènes</h3>
        <Button variant="secondary" onClick={() => window.print()}>Imprimer la grille</Button>
      </div>
      <p className="trade-hint">Cliquez sur une case : ● présent, ◐ traces possibles, vide = absent. « Publier » met à jour la fiche produit de la boutique en ligne.</p>
      <div className="trade-table">
        <table className="trade-matrix">
          <thead><tr><th>Produit</th>{allergens.map((allergen) => <th key={allergen}><span>{allergen}</span></th>)}<th><span className="sr-only">Publier</span></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                {allergens.map((allergen) => {
                  const mark = item.present.includes(allergen) ? "●" : item.traces.includes(allergen) ? "◐" : "";
                  return (
                    <td key={allergen}>
                      <button className="trade-cell" aria-label={`${item.name} · ${allergen} : ${mark === "●" ? "présent" : mark === "◐" ? "traces" : "absent"}`} onClick={() => cycle(item.id, allergen)}>{mark}</button>
                    </td>
                  );
                })}
                <td>
                  {dirty.has(item.id) && (
                    <Button disabled={busy} onClick={async () => {
                      if (await perform({ action: "allergens", menuId: item.id, present: item.present, traces: item.traces }, `Allergènes de « ${item.name} » publiés.`))
                        setDirty((current) => { const next = new Set(current); next.delete(item.id); return next; });
                    }}>Publier</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 && <p className="trade-empty">Ajoutez des produits à votre carte pour renseigner leurs allergènes.</p>}
    </section>
  );
}

type Appointment = { id: string; client: string; phone: string; staff: string; chair: number | null; status: string; service: string; price: number; start: string; minutes: number; conflict: boolean };
function Agenda({ state }: { state: ToolState }) {
  const [date, setDate] = useState(String(state.extra?.today ?? new Date().toISOString().slice(0, 10)));
  const list = ((state.extra?.appointments as Appointment[]) ?? []).filter((entry) => new Date(entry.start).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) === date);
  const staff = [...new Set(list.map((entry) => entry.staff))].sort();
  return (
    <section className="card trade-panel" aria-label="Agenda du jour">
      <div className="trade-section-head">
        <h3>Agenda du jour</h3>
        <label className="trade-inline">Jour <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
      {list.length === 0 ? <p className="trade-empty">Aucun rendez-vous ce jour-là.</p> : (
        <div className="trade-agenda">
          {staff.map((name) => (
            <div key={name} className="trade-agenda-column">
              <h4>{name}</h4>
              {list.filter((entry) => entry.staff === name).sort((a, b) => a.start.localeCompare(b.start)).map((entry) => (
                <div key={entry.id} className={`trade-slot${entry.conflict ? " is-conflict" : ""}`} data-status={entry.status}>
                  <b>{new Date(entry.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {entry.minutes} min</b>
                  <span>{entry.client} — {entry.service}</span>
                  <small>{entry.status}{entry.chair ? ` · fauteuil ${entry.chair}` : ""} · {euro(entry.price)}</small>
                  {entry.conflict && <small className="trade-alert">Chevauchement avec un autre rendez-vous</small>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ShippingSimulator({ state }: { state: ToolState }) {
  const [postcode, setPostcode] = useState("");
  const [cart, setCart] = useState("40");
  const zones = (state.extra?.zones as Parameters<typeof shippingQuote>[0]) ?? [];
  const result = postcode ? shippingQuote(zones, postcode, Math.round(Number(cart) * 100)) : undefined;
  return (
    <section className="card trade-panel" aria-label="Simulateur de livraison">
      <h3>Simulateur de frais</h3>
      <div className="trade-form">
        <label>Code postal du client<input value={postcode} inputMode="numeric" maxLength={10} onChange={(event) => setPostcode(event.target.value)} placeholder="75011" /></label>
        <label>Montant du panier (€)<input type="number" min={0} step="0.01" value={cart} onChange={(event) => setCart(event.target.value)} /></label>
      </div>
      {result === null && <p className="trade-note is-warn">Aucune zone ne couvre ce code postal : la livraison n’y est pas proposée.</p>}
      {result && (
        <p className="trade-note is-good">
          Zone « {result.zone} » · {result.mode} · <b>{result.free ? "livraison offerte" : euro(result.fee)}</b>
          {result.delay !== null && ` · ${result.delay} jour(s)`}
        </p>
      )}
    </section>
  );
}

type Member = { name: string; contact: string; orders: number; spend: number; lastOrder: string | null };
function SegmentMembers({ state }: { state: ToolState }) {
  const members = (state.extra?.members as Record<string, Member[]>) ?? {};
  const names = Object.keys(members);
  const [selected, setSelected] = useState(names[0] ?? "");
  const list = members[selected] ?? [];
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = ["Nom;Contact;Commandes;Dépense;Dernière commande", ...list.map((member) =>
      [member.name, member.contact, String(member.orders), (member.spend / 100).toFixed(2), member.lastOrder?.slice(0, 10) ?? ""].map(escape).join(";"))].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `segment-${selected.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <section className="card trade-panel" aria-label="Clients du segment">
      <div className="trade-section-head">
        <h3>Clients du segment</h3>
        <label className="trade-inline">Segment
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>{names.map((name) => <option key={name}>{name}</option>)}</select>
        </label>
        <Button variant="secondary" disabled={!list.length} onClick={exportCsv}>Exporter en CSV</Button>
      </div>
      {list.length === 0 ? <p className="trade-empty">Aucun client dans ce segment.</p> : (
        <div className="trade-table">
          <table>
            <thead><tr><th>Client</th><th>Contact</th><th>Commandes</th><th>Dépense</th><th>Dernière commande</th></tr></thead>
            <tbody>{list.map((member, index) => (
              <tr key={index}><td>{member.name}</td><td>{member.contact || "—"}</td><td>{member.orders}</td><td>{euro(member.spend)}</td><td>{member.lastOrder ? new Date(member.lastOrder).toLocaleDateString("fr-FR") : "—"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function QuotePrint({ record, onClose }: { record: RowLike; onClose: () => void }) {
  const lines = (record.data.lines as QuoteLine[]) ?? [];
  const totals = quoteTotals(lines);
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 100);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="trade-quote-print trade-print" role="dialog" aria-label={`Devis ${String(record.data.number)}`}>
      <div className="trade-section-head trade-no-print">
        <Button variant="secondary" onClick={onClose}>Fermer l’aperçu</Button>
        <Button onClick={() => window.print()}>Imprimer</Button>
      </div>
      <h2>Devis {String(record.data.number)}</h2>
      <p><b>{String(record.data.title)}</b></p>
      <p>Client : {String(record.data.client)}{record.data.address ? ` · ${String(record.data.address)}` : ""}</p>
      {typeof record.data.validity === "string" && <p>Valable jusqu’au {new Date(`${record.data.validity}T12:00:00`).toLocaleDateString("fr-FR")}</p>}
      <table>
        <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>PU HT</th><th>TVA</th><th>Total HT</th></tr></thead>
        <tbody>{lines.map((line, index) => (
          <tr key={index}><td>{line.label}</td><td>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(line.quantity)}</td><td>{line.unit}</td><td>{euro(line.unitPrice)}</td><td>{line.vat} %</td><td>{euro(Math.round(line.quantity * line.unitPrice))}</td></tr>
        ))}</tbody>
      </table>
      <p className="trade-totals">Total HT {euro(totals.net)} · TVA {euro(totals.vat)} · <b>Total TTC {euro(totals.gross)}</b></p>
      <p className="trade-hint">Bon pour accord — date et signature du client :</p>
    </div>
  );
}
type RowLike = { data: Record<string, unknown> };

export function ToolView({ tool, restaurant, act }: { tool: TradeTool; restaurant: string; act?: Act }) {
  const [state, setState] = useState<ToolState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState<RowLike | null>(null);
  const url = api(restaurant, tool.id);
  const refresh = useCallback(async () => {
    try {
      setState(await request<ToolState>(url));
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [url]);
  useEffect(() => {
    void refresh();
    if (tool.view !== "kitchen-board" && tool.id !== "service-pacing") return;
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh, tool.view, tool.id]);
  const perform = async (body: unknown, success: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setState(await request<ToolState>(url, post(body)));
      setNotice(success);
      return true;
    } catch (reason) {
      setError((reason as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="trade-tool" aria-label={tool.name}>
      <header className="trade-tool-head">
        {/* Le titre de l'écran porte déjà le nom de l'outil (entrée OPÉRATIONS). */}
        <p>{tool.description}</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!state ? (!error && <p role="status">Chargement de l’outil…</p>) : (
        <>
          <Panels panels={state.panels} />
          {tool.view === "kitchen-board" && <KitchenBoard state={state} act={act} refresh={refresh} />}
          {tool.view === "allergen-matrix" && <AllergenMatrix key={state.records.length + JSON.stringify(state.extra?.items ?? []).length} state={state} busy={busy} perform={perform} />}
          {tool.view === "agenda" && <Agenda state={state} />}
          {tool.id === "shipping-rules" && <ShippingSimulator state={state} />}
          {tool.id === "customer-segments" && <SegmentMembers state={state} />}
          {tool.entities.map((entity) => (
            <EntitySection key={entity.id} entity={entity} state={state} busy={busy} perform={perform}
              onPrint={tool.view === "quote" && entity.id === "quote" ? (record) => setPrinting(record) : undefined} />
          ))}
          {printing && <QuotePrint record={printing} onClose={() => setPrinting(null)} />}
        </>
      )}
    </section>
  );
}

