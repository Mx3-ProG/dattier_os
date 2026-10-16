"use client";
import { useRef, useState } from "react";

export type MapTable = {
  id: string;
  number: number;
  capacity: number;
  shape: string;
  pos_x: number;
  pos_y: number;
  zone: string;
  label: string;
};

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

/** Rectangle englobant chaque zone, pour dessiner les espaces de la salle. */
function zones(tables: MapTable[]) {
  const by = new Map<string, MapTable[]>();
  for (const t of tables) by.set(t.zone, [...(by.get(t.zone) ?? []), t]);
  return [...by].map(([name, list]) => {
    const xs = list.map((t) => t.pos_x),
      ys = list.map((t) => t.pos_y);
    const left = Math.max(1, Math.min(...xs) - 11),
      top = Math.max(1, Math.min(...ys) - 14);
    return {
      name,
      left,
      top,
      width: Math.min(99, Math.max(...xs) + 11) - left,
      height: Math.min(99, Math.max(...ys) + 14) - top,
    };
  });
}

export function FloorMap({
  tables,
  stateOf,
  caption,
  onSelect,
  onMove,
  disabled,
  hint,
}: {
  tables: MapTable[];
  /** Classe d’état appliquée à la table (free, taken, small, selected…). */
  stateOf: (t: MapTable) => string;
  caption: (t: MapTable) => string;
  onSelect?: (t: MapTable) => void;
  /** Mode aménagement : glisser-déposer et flèches du clavier. */
  onMove?: (t: MapTable, x: number, y: number) => void;
  disabled?: (t: MapTable) => boolean;
  hint?: React.ReactNode;
}) {
  const room = useRef<HTMLDivElement>(null),
    [drag, setDrag] = useState<{
      id: string;
      x: number;
      y: number;
      moved: boolean;
    } | null>(null);
  const place = (e: React.PointerEvent) => {
    const r = room.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.round(Math.min(95, Math.max(5, v)));
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100),
    };
  };
  return (
    <div className={`floor-map${onMove ? " editing" : ""}`} ref={room}>
      {zones(tables).map((z) => (
        <div
          key={z.name}
          className="floor-zone"
          style={{
            left: `${z.left}%`,
            top: `${z.top}%`,
            width: `${z.width}%`,
            height: `${z.height}%`,
          }}
        >
          <span>{z.name}</span>
        </div>
      ))}
      <span className="floor-entry">Entrée</span>
      {tables.map((t) => {
        const pos = drag?.id === t.id ? drag : { x: t.pos_x, y: t.pos_y };
        const state = stateOf(t);
        return (
          <button
            key={t.id}
            type="button"
            className={`map-table ${t.shape} cap-${Math.min(t.capacity, 12)} ${state}${drag?.id === t.id ? " dragging" : ""}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            aria-label={`Table ${t.number}${t.label ? ` (${t.label})` : ""} · ${t.capacity} places · ${caption(t)}`}
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
              <b>{t.number}</b>
              <small>{t.capacity} pl.</small>
            </span>
          </button>
        );
      })}
      {hint && <div className="floor-hint">{hint}</div>}
    </div>
  );
}
