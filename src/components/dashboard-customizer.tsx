"use client";
import { useState } from "react";
import type { NavigationContribution } from "@/core/navigation/registry";
import { encodeNavigationPreferences } from "@/features/navigation/preferences";

export function DashboardCustomizer({
  restaurant,
  entries,
  hidden,
  setHidden,
}: {
  restaurant: string;
  entries: (NavigationContribution & { name: string })[];
  hidden: string[];
  setHidden: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(hidden);
  const toggle = (id: string) => {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const save = () => {
    setHidden(draft);
    try {
      window.localStorage.setItem(
        `studio-os:navigation:v1:${encodeURIComponent(restaurant)}`,
        encodeNavigationPreferences(draft),
      );
    } catch {
      /* ignore */
    }
  };
  const reset = () => {
    setDraft([]);
    setHidden([]);
    try {
      window.localStorage.setItem(
        `studio-os:navigation:v1:${encodeURIComponent(restaurant)}`,
        encodeNavigationPreferences([]),
      );
    } catch {
      /* ignore */
    }
  };
  return (
    <section className="card" style={{ padding: 20 }}>
      <h2>Modifier mon tableau de bord</h2>
      <p>
        Choisissez les modules qui apparaissent dans votre menu de navigation.
        Masquer un module ne désactive pas la fonctionnalité ni votre
        abonnement : il disparaît seulement du menu. Les modules disponibles
        dépendent de vos add-ons.
      </p>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>Modules affichés</legend>
        <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
          {entries
            .filter((entry) => entry.id !== "dashboard")
            .map((entry) => (
              <label
                key={entry.id}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={!draft.includes(entry.id)}
                  onChange={() => toggle(entry.id)}
                />
                {entry.name}
                <small style={{ color: "#666" }}>({entry.group})</small>
              </label>
            ))}
        </div>
      </fieldset>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={save}>
          Enregistrer
        </button>
        <button className="btn secondary" onClick={reset}>
          Tout afficher
        </button>
      </div>
      <p role="status" style={{ marginTop: 8 }}>
        {draft.length === 0
          ? "Tous les modules disponibles sont affichés."
          : `${draft.length} module(s) masqué(s).`}
      </p>
    </section>
  );
}