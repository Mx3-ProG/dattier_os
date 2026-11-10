"use client";
import { Expand, Minimize, Minus, Pause, Play, Plus, Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GlobePoint } from "@/features/analytics/cluster";
import { globeAssets, loadGlobeEngine, webglAvailable } from "./assets";
import { WorldMap2D } from "./map-2d";
import type { GlobeHandle, GlobeHover, GlobeSelection } from "./types";

const number = new Intl.NumberFormat("fr-FR");
export type PulseEvent = { id: string; lat: number; lng: number };

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function GlobeView({
  points,
  pulses,
  mode,
  focus,
  selectedCountry,
  onSelectCountry,
  onFallback,
  badge,
}: {
  points: readonly GlobePoint[];
  pulses: readonly PulseEvent[];
  mode: "3d" | "2d";
  focus: { lat: number; lng: number } | null;
  selectedCountry: string | null;
  onSelectCountry: (country: string) => void;
  /** Le rendu 3D n’a pas démarré : l’interface reflète la carte affichée. */
  onFallback?: () => void;
  badge?: string;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const engine = useRef<GlobeHandle | null>(null);
  const reducedMotion = useReducedMotion();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [markers, setMarkers] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [hover, setHover] = useState<GlobeHover>(null);
  const [touched, setTouched] = useState<GlobeSelection | null>(null);
  const handlers = useRef({ onSelectCountry, onFallback, points, markers, autoRotate });
  useEffect(() => {
    handlers.current = { onSelectCountry, onFallback, points, markers, autoRotate };
  });
  useEffect(() => setSupported(webglAvailable()), []);
  const show3d = mode === "3d" && supported === true && !failed;
  const fallBack = useCallback(() => {
    setFailed(true);
    handlers.current.onFallback?.();
  }, []);
  useEffect(() => {
    if (supported === false && mode === "3d") handlers.current.onFallback?.();
  }, [supported, mode]);
  useEffect(() => {
    if (!show3d || !stage.current) return;
    let cancelled = false;
    let created: GlobeHandle | null = null;
    const container = stage.current;
    setReady(false);
    loadGlobeEngine()
      .then((factory) =>
        factory({
          container,
          reducedMotion,
          lowPower: window.matchMedia("(max-width: 720px), (pointer: coarse)").matches,
          autoRotate: handlers.current.autoRotate,
          assets: globeAssets,
          onHover: setHover,
          onSelect: (selection) => {
            setTouched(selection);
            const country = selection.cluster?.country ?? selection.country;
            if (country) handlers.current.onSelectCountry(country);
          },
          onContextLost: fallBack,
        }),
      )
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        created = handle;
        engine.current = handle;
        handle.setPoints(handlers.current.points);
        handle.setMarkersVisible(handlers.current.markers);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) fallBack();
      });
    return () => {
      cancelled = true;
      created?.dispose();
      engine.current = null;
      setHover(null);
    };
  }, [show3d, reducedMotion, fallBack]);
  useEffect(() => engine.current?.setPoints(points), [points, ready]);
  useEffect(() => engine.current?.setMarkersVisible(markers), [markers, ready]);
  useEffect(() => engine.current?.setAutoRotate(autoRotate), [autoRotate, ready]);
  useEffect(() => {
    if (focus) engine.current?.focus(focus.lat, focus.lng);
    if (focus) setAutoRotate(false);
  }, [focus, ready]);
  const lastPulse = useRef<string | null>(null);
  useEffect(() => {
    const latest = pulses[pulses.length - 1];
    if (!latest || latest.id === lastPulse.current) return;
    const start = lastPulse.current ? pulses.findIndex((pulse) => pulse.id === lastPulse.current) + 1 : pulses.length - 1;
    for (const pulse of pulses.slice(start)) engine.current?.pulse(pulse.lat, pulse.lng);
    lastPulse.current = latest.id;
  }, [pulses, ready]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.current?.requestFullscreen?.().catch(() => undefined);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const action: Record<string, () => void> = {
      ArrowLeft: () => engine.current?.rotateBy(-12),
      ArrowRight: () => engine.current?.rotateBy(12),
      "+": () => engine.current?.zoomBy(0.88),
      "=": () => engine.current?.zoomBy(0.88),
      "-": () => engine.current?.zoomBy(1.14),
    };
    if (action[event.key]) {
      event.preventDefault();
      action[event.key]();
    }
  };
  return (
    <div className={`et-globe${fullscreen ? " is-fullscreen" : ""}`} ref={shell}>
      {badge && <span className="et-demo-badge" role="note">{badge}</span>}
      {show3d ? (
        <div
          className="et-stage"
          ref={stage}
          data-testid="et-globe-3d"
          data-ready={ready}
          tabIndex={0}
          role="application"
          aria-label="Globe terrestre interactif. Flèches gauche et droite pour tourner, plus et moins pour zoomer."
          onKeyDown={onKeyDown}
        >
          {!ready && <p className="et-stage-loading" role="status">Chargement du globe…</p>}
        </div>
      ) : supported === null && mode === "3d" ? (
        <div className="et-stage" />
      ) : (
        <div className="et-stage-2d">
          {mode === "3d" && (
            <p className="et-fallback-note" role="status">
              Le globe 3D n’est pas disponible sur cet appareil : affichage de la carte 2D.
            </p>
          )}
          <WorldMap2D
            points={points}
            showMarkers={markers}
            selectedCountry={selectedCountry}
            pulses={reducedMotion ? [] : pulses.slice(-6)}
            onSelectCountry={onSelectCountry}
          />
        </div>
      )}
      {hover && (
        <div className="et-tooltip" style={{ left: hover.x, top: hover.y }} role="status">
          <strong>{hover.cluster.label}</strong>
          <span>
            {number.format(hover.cluster.weight)} pages vues · {number.format(hover.cluster.sessions)} sessions est.
          </span>
          {hover.cluster.approximate && <small>Position au centre du pays</small>}
        </div>
      )}
      {touched?.cluster && !hover && (
        <div className="et-tooltip et-tooltip-fixed" role="status">
          <strong>{touched.cluster.label}</strong>
          <span>
            {number.format(touched.cluster.weight)} pages vues · {number.format(touched.cluster.sessions)} sessions est.
          </span>
        </div>
      )}
      <div className="et-controls" role="group" aria-label="Commandes du globe">
        {show3d && !reducedMotion && (
          <button
            type="button"
            aria-pressed={autoRotate}
            title={autoRotate ? "Arrêter la rotation" : "Reprendre la rotation"}
            aria-label={autoRotate ? "Arrêter la rotation automatique" : "Reprendre la rotation automatique"}
            onClick={() => setAutoRotate((value) => !value)}
          >
            {autoRotate ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
        <button
          type="button"
          aria-pressed={markers}
          title={markers ? "Masquer les marqueurs" : "Afficher les marqueurs"}
          aria-label={markers ? "Masquer les marqueurs" : "Afficher les marqueurs"}
          onClick={() => setMarkers((value) => !value)}
        >
          {markers ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        {show3d && (
          <>
            <button type="button" title="Rapprocher" aria-label="Rapprocher" onClick={() => engine.current?.zoomBy(0.85)}>
              <Plus size={16} />
            </button>
            <button type="button" title="Éloigner" aria-label="Éloigner" onClick={() => engine.current?.zoomBy(1.18)}>
              <Minus size={16} />
            </button>
          </>
        )}
        <button
          type="button"
          title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
          aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize size={16} /> : <Expand size={16} />}
        </button>
      </div>
    </div>
  );
}
