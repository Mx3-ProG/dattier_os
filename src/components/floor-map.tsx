"use client";
import { useRef, useState } from "react";

export type MapTable = {
  id: string;
  number: number;
  capacity: number;
  shape: string;
  pos_x: number;
  pos_y: number;
  /** Angle en degrés, sens horaire ; chaises comprises. */
  rotation?: number;
  zone: string;
  label: string;
};

/** Angle ramené dans 0–359. */
export const normalizeAngle = (a: number) =>
  ((Math.round(a) % 360) + 360) % 360;

/** Positions des chaises autour d’une table, en % de la table. */
function chairs(shape: string, n: number) {
  if (shape === "round")
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      return { x: 50 + 68 * Math.cos(a), y: 50 + 68 * Math.sin(a) };
    });
  const sides =
    shape === "rect"
      ? (() => {
          const ends = n >= 6 ? 1 : 0;
          const top = Math.ceil((n - 2 * ends) / 2);
          return [top, n - 2 * ends - top, ends, ends];
        })()
      : [0, 1, 2, 3].map((s) => Math.floor(n / 4) + (s < n % 4 ? 1 : 0));
  const [top, bottom, left, right] = sides;
  const spread = (k: number) =>
    Array.from({ length: k }, (_, i) => ((i + 1) / (k + 1)) * 100);
  return [
    ...spread(top).map((x) => ({ x, y: -26 })),
    ...spread(bottom).map((x) => ({ x, y: 126 })),
    ...spread(left).map((y) => ({ x: shape === "rect" ? -14 : -26, y })),
    ...spread(right).map((y) => ({ x: shape === "rect" ? 114 : 126, y })),
  ];
}

/** Onglets de zones au-dessus du plan (masqués s’il n’y a qu’une zone). */
export function ZoneSwitch({
  zones,
  current,
  onChange,
  note,
}: {
  zones: string[];
  current: string;
  onChange: (zone: string) => void;
  /** Complément affiché sous le nom (ex. « 3 libres »). */
  note?: (zone: string) => string;
}) {
  if (zones.length < 2) return null;
  return (
    <div className="zone-switch" role="tablist" aria-label="Zones de la salle">
      {zones.map((z) => (
        <button
          key={z}
          type="button"
          role="tab"
          aria-selected={z === current}
          className={z === current ? "active" : ""}
          onClick={() => onChange(z)}
        >
          {z}
          {note && <small>{note(z)}</small>}
        </button>
      ))}
    </div>
  );
}

export function FloorMap({
  tables,
  zone,
  entry = true,
  stateOf,
  caption,
  onSelect,
  onMove,
  onRotate,
  disabled,
  hint,
}: {
  tables: MapTable[];
  /** Nom de la zone dessinée : chaque zone a son propre canevas. */
  zone?: string;
  /** Repère « Entrée » (en général sur la première zone seulement). */
  entry?: boolean;
  /** Classe d’état appliquée à la table (free, taken, small, selected…). */
  stateOf: (t: MapTable) => string;
  caption: (t: MapTable) => string;
  onSelect?: (t: MapTable) => void;
  /** Mode aménagement : glisser-déposer et flèches du clavier. */
  onMove?: (t: MapTable, x: number, y: number) => void;
  /** Mode aménagement : poignée de rotation (pas de 15°, Maj pour 1°) et touche R. */
  onRotate?: (t: MapTable, angle: number) => void;
  disabled?: (t: MapTable) => boolean;
  hint?: React.ReactNode;
}) {
  const room = useRef<HTMLDivElement>(null),
    [drag, setDrag] = useState<{
      id: string;
      x: number;
      y: number;
      moved: boolean;
    } | null>(null),
    [turn, setTurn] = useState<{ id: string; angle: number } | null>(null);
  const place = (e: React.PointerEvent) => {
    const r = room.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.round(Math.min(95, Math.max(5, v)));
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100),
    };
  };
  // Angle du pointeur autour du centre de la table, poignée en haut = 0°.
  const aim = (e: React.PointerEvent, table: Element) => {
    const b = table.getBoundingClientRect();
    const deg =
      (Math.atan2(
        e.clientY - (b.top + b.height / 2),
        e.clientX - (b.left + b.width / 2),
      ) *
        180) /
        Math.PI +
      90;
    return normalizeAngle(e.shiftKey ? deg : Math.round(deg / 15) * 15);
  };
  return (
    <div className={`floor-map${onMove ? " editing" : ""}`} ref={room}>
      {zone && (
        <div className="floor-zone">
          <span>{zone}</span>
        </div>
      )}
      {entry && <span className="floor-entry">Entrée</span>}
      {tables.map((t) => {
        const pos = drag?.id === t.id ? drag : { x: t.pos_x, y: t.pos_y };
        const angle = turn?.id === t.id ? turn.angle : (t.rotation ?? 0);
        const state = stateOf(t);
        return (
          <button
            key={t.id}
            type="button"
            className={`map-table ${t.shape} cap-${Math.min(t.capacity, 12)} ${state}${drag?.id === t.id ? " dragging" : ""}${turn?.id === t.id ? " turning" : ""}`}
            style={
              {
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                "--rot": `${angle}deg`,
              } as React.CSSProperties
            }
            aria-label={`Table ${t.number}${t.label ? ` (${t.label})` : ""} · ${t.capacity} places${angle ? ` · tournée de ${angle}°` : ""} · ${caption(t)}`}
            aria-pressed={state === "selected"}
            disabled={!onMove && disabled?.(t)}
            // En aménagement, la souris passe par pointerup ; le clavier (detail 0) par click.
            onClick={(e) => (!onMove || e.detail === 0) && onSelect?.(t)}
            onPointerDown={(e) => {
              if (!onMove) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ id: t.id, x: t.pos_x, y: t.pos_y, moved: false });
            }}
            onPointerMove={(e) => {
              if (drag?.id !== t.id) return;
              const p = place(e);
              if (p.x !== drag.x || p.y !== drag.y)
                setDrag({ id: t.id, ...p, moved: true });
            }}
            onPointerUp={() => {
              if (drag?.id !== t.id) return;
              if (drag.moved) onMove!(t, drag.x, drag.y);
              else onSelect?.(t);
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => {
              if (onRotate && (e.key === "r" || e.key === "R")) {
                e.preventDefault();
                onRotate(t, normalizeAngle(angle + (e.shiftKey ? -15 : 15)));
                return;
              }
              const step = {
                ArrowLeft: [-2, 0],
                ArrowRight: [2, 0],
                ArrowUp: [0, -2],
                ArrowDown: [0, 2],
              }[e.key];
              if (!onMove || !step) return;
              e.preventDefault();
              onMove(
                t,
                Math.min(95, Math.max(5, t.pos_x + step[0])),
                Math.min(95, Math.max(5, t.pos_y + step[1])),
              );
            }}
          >
            {chairs(t.shape, Math.min(t.capacity, 12)).map((c, i) => (
              <i
                key={i}
                className="chair"
                style={{ left: `${c.x}%`, top: `${c.y}%` }}
              />
            ))}
            <span className="map-table-top">
              {/* Le numéro reste lisible quel que soit l’angle de la table. */}
              <span className="map-table-text">
                <b>{t.number}</b>
                <small>{t.capacity} pl.</small>
              </span>
            </span>
            {onRotate && (
              <span
                className="rotate-handle"
                aria-hidden
                title="Tourner (pas de 15°, Maj pour 1°)"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setTurn({ id: t.id, angle });
                }}
                onPointerMove={(e) => {
                  if (turn?.id !== t.id) return;
                  const next = aim(e, e.currentTarget.parentElement!);
                  if (next !== turn.angle) setTurn({ id: t.id, angle: next });
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (turn?.id !== t.id) return;
                  if (turn.angle !== (t.rotation ?? 0)) onRotate(t, turn.angle);
                  setTurn(null);
                }}
                onPointerCancel={() => setTurn(null)}
              >
                {turn?.id === t.id && <em>{turn.angle}°</em>}
              </span>
            )}
          </button>
        );
      })}
      {hint && <div className="floor-hint">{hint}</div>}
    </div>
  );
}
