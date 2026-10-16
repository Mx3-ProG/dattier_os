"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import type { HistoryEntry } from "@/features/events/history";
import { categories, category } from "@/features/events/categories";
import { CategoryIcon, canSeeCategory } from "./notifications";
const periods = [
  { days: 1, label: "Aujourd’hui" },
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 0, label: "Tout" },
];
const day = (s: string) =>
  new Date(s).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const time = (s: string) =>
  new Date(s).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
/**
 * Historique opérationnel : qui a fait quoi, rubrique par rubrique. Le serveur
 * ne renvoie que les rubriques couvertes par les permissions du profil et ses
 * propres actions.
 */
export function HistoryPage({ data }: { data: Snapshot }) {
  const [filter, setFilter] = useState(""),
    [days, setDays] = useState(7),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [items, setItems] = useState<HistoryEntry[]>([]),
    [next, setNext] = useState<string | null>(null),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const restaurant = data.restaurant.id;
  const fetchPage = useCallback(
    async (before?: string) => {
      const p = new URLSearchParams({ restaurant });
      if (filter) p.set("category", filter);
      if (days) p.set("days", String(days));
      if (query) p.set("q", query);
      if (before) p.set("before", before);
      const r = await fetch(`/api/v1/history?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d as {
        items: HistoryEntry[];
        hasMore: boolean;
        next: string | null;
      };
    },
    [restaurant, filter, days, query],
  );
  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const d = await fetchPage();
      setItems(d.items);
      setMore(d.hasMore);
      setNext(d.next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [fetchPage]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  async function loadMore() {
    if (!next) return;
    setBusy(true);
    try {
      const d = await fetchPage(next);
      setItems((all) => [...all, ...d.items]);
      setMore(d.hasMore);
      setNext(d.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visibleCategories = categories.filter(
    (c) => c.id !== "general" && canSeeCategory(data.user, c.id),
  );
  const dayList = [...new Set(items.map((i) => day(i.created_at)))];
  return (
    <div className="history-page">
      <p className="muted">
        Chaque action enregistrée, avec son auteur, pour les rubriques de votre
        métier. Le journal de sécurité reste séparé.
      </p>
      <div className="history-filters card">
        <label>
          Rubrique
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Toutes mes rubriques</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Période
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {periods.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="history-search">
          Rechercher
          <span>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Table, produit, employé…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </span>
        </label>
        <button
          className="icon-button"
          aria-label="Actualiser l’historique"
          onClick={() => void reload()}
          disabled={busy}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!items.length && !busy && !error && (
        <div className="card empty-state">
          <p>Aucune activité sur cette période.</p>
        </div>
      )}
      {dayList.map((d) => (
        <section key={d} className="history-day" aria-label={d}>
          <h2>{d}</h2>
          <ol className="card history-list">
            {items
              .filter((i) => day(i.created_at) === d)
              .map((i) => (
                <li key={i.id}>
                  <time dateTime={i.created_at}>{time(i.created_at)}</time>
                  <span
                    className="history-category"
                    title={category(i.module).label}
                  >
                    <CategoryIcon id={category(i.module).id} size={15} />
                    {category(i.module).label}
                  </span>
                  <p>{i.summary}</p>
                  <small>{i.actor_name ?? "Automatique"}</small>
                </li>
              ))}
          </ol>
        </section>
      ))}
      {more && (
        <button
          className="text-button history-more"
          onClick={() => void loadMore()}
          disabled={busy}
        >
          {busy ? "Chargement…" : "Afficher plus ancien"}
        </button>
      )}
    </div>
  );
}
