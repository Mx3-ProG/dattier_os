"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import "./black-friday-bar.css";
import type { Promotion } from "@/features/platform/promotion";

/** Time left before the offer ends, shown only after mount to avoid a hydration mismatch. */
function useRemaining(endsAt: string) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Date.parse(endsAt) - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  return left;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Bandeau Black Friday affiché au-dessus de l’en-tête de la Home. */
export function BlackFridayBar({ promo }: { promo: Promotion }) {
  const left = useRemaining(promo.endsAt);
  if (left === 0) return null;
  const s = Math.floor((left ?? 0) / 1000);
  const days = Math.floor(s / 86400);
  return (
    <aside className="bf-bar" aria-label="Offre Black Friday">
      <span className="bf-bar-tag">Black Friday</span>
      <p className="bf-bar-offer">
        <strong>
          <s>39 €</s> {promo.price} € TTC / mois
        </strong>{" "}
        pendant {promo.months} mois avec le code <code>{promo.code}</code>
        <span className="bf-bar-deadline"> · jusqu’au {promo.lastDay} minuit</span>
      </p>
      {left !== null && (
        <span className="bf-bar-timer" aria-label="Temps restant" role="timer">
          {days > 0 && <b>{days} j</b>}
          <b>{pad(Math.floor((s % 86400) / 3600))} h</b>
          <b>{pad(Math.floor((s % 3600) / 60))} min</b>
          <b>{pad(s % 60)} s</b>
        </span>
      )}
      <Link className="bf-bar-cta" href="/checkout/39">
        Je m’abonne à {promo.price} € <ArrowUpRight size={15} aria-hidden />
      </Link>
    </aside>
  );
}
