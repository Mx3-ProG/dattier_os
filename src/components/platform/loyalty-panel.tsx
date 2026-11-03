"use client";
import { useState } from "react";
export function LoyaltyPanel({
  rewards,
  busy,
  submit,
}: {
  rewards: { id: string; name: string; points_cost: number; active: boolean }[];
  busy: boolean;
  submit: (a: unknown) => void;
}) {
  const [name, setName] = useState(""),
    [points, setPoints] = useState(100),
    [value, setValue] = useState(5);
  return (
    <section>
      <h2>Récompenses fidélité</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({
            action: "loyaltyReward",
            name,
            points,
            kind: "fixed",
            value: Math.round(value * 100),
          });
        }}
      >
        <label>
          Nom de la récompense
          <input
            required
            maxLength={150}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Coût en points
          <input
            type="number"
            min="1"
            max="100000"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </label>
        <label>
          Remise offerte (€)
          <input
            type="number"
            min="0.01"
            max="1000"
            step="0.01"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </label>
        <button disabled={busy}>Créer la récompense</button>
      </form>
      {rewards.map((r) => (
        <article key={r.id}>
          <h3>{r.name}</h3>
          <p>
            {r.points_cost} points · {r.active ? "Disponible" : "Archivée"}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              submit({ action: "rewardLifecycle", id: r.id, active: !r.active })
            }
          >
            {r.active ? "Archiver" : "Restaurer"}
          </button>
        </article>
      ))}
    </section>
  );
}
