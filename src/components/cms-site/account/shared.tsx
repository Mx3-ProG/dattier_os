"use client";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  CalendarCheck,
  Crown,
  Gift,
  Heart,
  Megaphone,
  Repeat,
  Sparkles,
  Star,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CustomerAccount } from "@/features/commerce/schema";

export type Account = CustomerAccount;
export type Engagement = CustomerAccount["engagement"];
export type ReorderItem = CustomerAccount["orders"][number]["reorder_items"][number];

export const badgeIcons: Record<string, LucideIcon> = {
  bag: ShoppingBag,
  repeat: Repeat,
  heart: Heart,
  crown: Crown,
  sparkles: Sparkles,
  gift: Gift,
  megaphone: Megaphone,
  calendar: CalendarCheck,
  utensils: UtensilsCrossed,
  zap: Zap,
  star: Star,
};

/** Current time, refreshed every `ms` (countdowns). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function countdown(endsAt: string, now: number) {
  const left = Math.max(0, Date.parse(endsAt) - now);
  const h = Math.floor(left / 3600000),
    m = Math.floor((left % 3600000) / 60000),
    s = Math.floor((left % 60000) / 1000);
  if (h >= 24) return `${Math.floor(h / 24)} j ${h % 24} h`;
  return `${h ? `${h} h ` : ""}${String(m).padStart(2, "0")} min ${String(s).padStart(2, "0")} s`;
}

export const shortDate = (date: string) =>
  new Date(date).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
  });

export const longDate = (date: string) =>
  new Date(date).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Progress ring drawn with two SVG circles; `value` between 0 and 1. */
export function Ring({
  value,
  size = 168,
  stroke = 12,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2,
    c = 2 * Math.PI * r,
    v = Math.max(0, Math.min(1, value));
  return (
    <div className="ca-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          className="ca-ring-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          className="ca-ring-value"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      <div className="ca-ring-label">{children}</div>
    </div>
  );
}

export function SectionTitle({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ca-section-title">
      <div>
        {kicker && <p className="ca-kicker">{kicker}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

/**
 * iOS-style sheet rendered inside the account (unlike the shared Modal,
 * which is portalled to <body>) so it inherits the restaurant's colours.
 */
export function Sheet({
  title,
  description,
  close,
  children,
}: {
  title: string;
  description?: string;
  close: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="ca-sheet-backdrop" onClick={close}>
      <div
        className="ca-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="ca-sheet-grabber" aria-hidden="true" />
        <h2>{title}</h2>
        {description && <p className="ca-muted">{description}</p>}
        <div className="ca-sheet-body">{children}</div>
      </div>
    </div>
  );
}
