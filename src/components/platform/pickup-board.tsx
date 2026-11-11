"use client";
import { useEffect, useRef, useState } from "react";
import { BellRing, ChefHat, Maximize2, PauseCircle } from "lucide-react";
import type { BoardOrder } from "@/features/commerce/premium";

type Board = { board: BoardOrder[]; flow: { paused: boolean; pausedUntil: string | null; prepMinutes: number } };

/** Numéros seulement : l'écran est visible de toute la salle. */
export function PickupBoard({ restaurant, name }: { restaurant: string; name: string }) {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<number[]>([]);
  const known = useRef<Set<number> | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/pickup`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || result.error || "Écran indisponible.");
      if (!active) return;
      const ready = (result as Board).board.filter((order) => order.stage === "ready").map((order) => order.number);
      // Mise en avant des numéros qui viennent de passer « prêts ».
      if (known.current) {
        const added = ready.filter((number) => !known.current!.has(number));
        if (added.length) setFresh(added);
      }
      known.current = new Set(ready);
      setData(result);
      setError("");
    };
    void load().catch((e: Error) => active && setError(e.message));
    const timer = setInterval(() => void load().catch((e: Error) => active && setError(e.message)), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [restaurant]);
  useEffect(() => {
    if (!fresh.length) return;
    const timer = setTimeout(() => setFresh([]), 8000);
    return () => clearTimeout(timer);
  }, [fresh]);
  const preparing = data?.board.filter((order) => order.stage === "preparing") ?? [];
  const ready = data?.board.filter((order) => order.stage === "ready") ?? [];
  return (
    <div className="pickup">
      <header>
        <h1>{name}</h1>
        {data?.flow.paused && (
          <span className="pickup-paused">
            <PauseCircle /> Commandes en ligne en pause
          </span>
        )}
        <button type="button" onClick={() => void document.documentElement.requestFullscreen?.()} aria-label="Plein écran">
          <Maximize2 />
        </button>
      </header>
      {error ? (
        <p className="pickup-error" role="alert">{error}</p>
      ) : (
        <main>
          <section>
            <h2>
              <ChefHat /> En préparation
            </h2>
            <ul>
              {preparing.map((order) => (
                <li key={order.number}>{order.number}</li>
              ))}
            </ul>
          </section>
          <section className="pickup-ready">
            <h2>
              <BellRing /> Prêtes
            </h2>
            <ul aria-live="polite">
              {ready.map((order) => (
                <li key={order.number} className={fresh.includes(order.number) ? "fresh" : ""}>
                  {order.number}
                  <small>{order.consumption === "onsite" ? "sur place" : "à emporter"}</small>
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}
    </div>
  );
}
