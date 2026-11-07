"use client";
import { useCallback, useEffect, useState } from "react";
import { Coffee, LogIn, LogOut, Play } from "lucide-react";
import "./qr.css";

type State = {
  name: string;
  restaurant: string;
  last: { event: string; created_at: string } | null;
};

const events = {
  start: { label: "Je commence", icon: LogIn, tone: "go" },
  break: { label: "Je prends ma pause", icon: Coffee, tone: "soft" },
  resume: { label: "Je reprends", icon: Play, tone: "go" },
  end: { label: "Je termine", icon: LogOut, tone: "stop" },
} as const;
type Event = keyof typeof events;
const next: Record<string, Event[]> = {
  end: ["start"],
  start: ["break", "end"],
  break: ["resume", "end"],
  resume: ["break", "end"],
};
const done_: Record<Event, string> = {
  start: "Arrivée",
  break: "Pause",
  resume: "Reprise",
  end: "Fin de service",
};
const status: Record<string, string> = {
  start: "En service",
  break: "En pause",
  resume: "En service",
  end: "Hors service",
};

/** Clock in / out in one tap after scanning the establishment's QR code. */
export function ClockIn() {
  const [restaurant, setRestaurant] = useState(""),
    [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [needsLogin, setNeedsLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState("");
  const load = useCallback(async (r: string) => {
    const response = await fetch(`/api/restaurants/${encodeURIComponent(r)}/qr?view=clock`);
    const data = await response.json();
    if (response.status === 401 || /Connexion/.test(data.error || "")) {
      setNeedsLogin(true);
      return;
    }
    if (!response.ok) throw new Error(data.error);
    setState(data);
  }, []);
  useEffect(() => {
    const r = new URLSearchParams(location.search).get("restaurant") || "";
    setRestaurant(r);
    if (!r) {
      setError("QR code de pointage incomplet.");
      return;
    }
    load(r).catch((e) => setError(e.message));
  }, [load]);
  async function clock(event: Event) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clock", event, restaurant }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDone(
        `${done_[event]} enregistrée à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`,
      );
      await load(restaurant);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const returnTo = `/pointage?restaurant=${encodeURIComponent(restaurant)}`;
  const current = state?.last?.event ?? "end";
  return (
    <main className="clock-page">
      <section className="clock-card">
        <p className="clock-kicker">Pointage</p>
        {needsLogin ? (
          <>
            <h1>Connectez-vous pour pointer</h1>
            <p className="clock-muted">
              Ce QR code est réservé à l’équipe de l’établissement.
            </p>
            <a className="clock-button go" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
              <LogIn size={20} /> Me connecter
            </a>
            <a className="clock-link" href="/demo">
              Mode démonstration : choisir un profil
            </a>
          </>
        ) : state ? (
          <>
            <h1>Bonjour {state.name.split(/\s+/)[0]}</h1>
            <p className="clock-muted">{state.restaurant}</p>
            <div className={`clock-status ${current}`}>
              <span className="clock-dot" /> {status[current]}
              {state.last && (
                <small>
                  depuis{" "}
                  {new Date(state.last.created_at).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              )}
            </div>
            <div className="clock-actions">
              {next[current].map((e) => {
                const Icon = events[e].icon;
                return (
                  <button
                    key={e}
                    className={`clock-button ${events[e].tone}`}
                    disabled={busy}
                    onClick={() => void clock(e)}
                  >
                    <Icon size={22} /> {events[e].label}
                  </button>
                );
              })}
            </div>
            {done && (
              <p className="clock-done" role="status">
                ✓ {done}
              </p>
            )}
            <a className="clock-link" href={`/dashboard?restaurant=${encodeURIComponent(restaurant)}&module=attendance`}>
              Voir mes présences →
            </a>
          </>
        ) : (
          !error && <p className="clock-muted">Chargement…</p>
        )}
        {error && (
          <p className="clock-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
