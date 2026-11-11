"use client";
import { ExternalLink, Flame, Monitor, PauseCircle, PlayCircle, Sparkles, Tablet } from "lucide-react";
import { pauseChoices, rushChoices } from "@/features/commerce/premium";

type Flow = { paused: boolean; pausedUntil: string | null; rushMinutes: number; prepMinutes: number };
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

/** Pilotage du Click & Collect Premium, ou présentation de l'offre s'il n'est pas actif. */
export function ClickCollectPanel({
  restaurant,
  premium,
  flow,
  busy,
  perform,
}: {
  restaurant: string;
  premium: boolean;
  flow: Flow | null;
  busy: boolean;
  perform: (body: unknown) => void;
}) {
  const id = encodeURIComponent(restaurant);
  if (!premium || !flow)
    return (
      <section className="cc-panel cc-teaser">
        <h2>
          <Sparkles size={20} /> Click & Collect Premium · 9 € / mois
        </h2>
        <p>
          Votre boutique en ligne reste incluse. Le Premium ajoute une borne de commande plein écran façon fast-food,
          la pause et le mode rush en un clic, et un écran de retrait pour la salle.
        </p>
        <a className="cc-link" href={`/dashboard?restaurant=${id}&module=addons`}>
          Découvrir l’add-on
        </a>
      </section>
    );
  const flowAction = (kind: "pause" | "rush", minutes: number) =>
    perform({ action: "flow", data: { kind, minutes } });
  return (
    <section className="cc-panel">
      <h2>
        <Sparkles size={20} /> Click & Collect Premium
      </h2>
      <div className="cc-status" role="status">
        {flow.paused && flow.pausedUntil ? (
          <strong className="cc-paused">
            <PauseCircle size={18} /> Commandes en pause jusqu’à {time(flow.pausedUntil)}
          </strong>
        ) : (
          <strong className="cc-open">
            <PlayCircle size={18} /> Commandes ouvertes · préparation {flow.prepMinutes} min
          </strong>
        )}
      </div>
      <div className="cc-row">
        <span>Pause</span>
        {flow.paused ? (
          <button type="button" disabled={busy} onClick={() => flowAction("pause", 0)}>
            Reprendre maintenant
          </button>
        ) : (
          pauseChoices
            .filter((minutes) => minutes > 0)
            .map((minutes) => (
              <button key={minutes} type="button" disabled={busy} onClick={() => flowAction("pause", minutes)}>
                {minutes === 720 ? "Jusqu’à reprise" : `${minutes} min`}
              </button>
            ))
        )}
      </div>
      <div className="cc-row">
        <span>
          <Flame size={16} /> Rush
        </span>
        {rushChoices.map((minutes) => (
          <button
            key={minutes}
            type="button"
            aria-pressed={flow.rushMinutes === minutes}
            disabled={busy}
            onClick={() => flowAction("rush", minutes)}
          >
            {minutes ? `+${minutes} min` : "Normal"}
          </button>
        ))}
      </div>
      <div className="cc-row cc-links">
        <a href={`/r/${id}/borne`} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Borne sur le site
        </a>
        <a href={`/r/${id}/borne?tablette=1`} target="_blank" rel="noreferrer">
          <Tablet size={16} /> Mode tablette (comptoir)
        </a>
        <a href={`/restaurant/${id}/retrait`} target="_blank" rel="noreferrer">
          <Monitor size={16} /> Écran de retrait
        </a>
      </div>
    </section>
  );
}
