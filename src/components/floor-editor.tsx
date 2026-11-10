"use client";
import { useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";
import type { Snapshot, Table, Zone } from "@/lib/types";
import { Button } from "./ui/button";
import { Badge, Form, Modal, statusLabels, type Act } from "./forms";
import { FloorMap, normalizeAngle } from "./floor-map";

const shapes = [
  { value: "square", label: "Carrée" },
  { value: "round", label: "Ronde" },
  { value: "rect", label: "Rectangulaire" },
];
const statuses = [
  { value: "free", label: "Libre" },
  { value: "cleaning", label: "À nettoyer" },
  { value: "unavailable", label: "Indisponible" },
];

/** Aménagement : zones, tables (ajout, déplacement, rotation, archivage, suppression). */
export function FloorEditor({ data, act }: { data: Snapshot; act: Act }) {
  const [editing, setEditing] = useState<Table | "new" | null>(null),
    [zoneEdit, setZoneEdit] = useState<Zone | "new" | null>(null),
    [zoneId, setZoneId] = useState<string | null>(null),
    // Position et angle affichés pendant l’enregistrement d’un geste.
    [moved, setMoved] = useState<
      Record<string, { x?: number; y?: number; rotation?: number }>
    >({}),
    [error, setError] = useState("");
  const zones = data.zones,
    zone = zones.find((z) => z.id === zoneId) ?? zones[0];
  const active = data.tables.filter((t) => !t.archived_at),
    archived = data.tables.filter((t) => t.archived_at);
  const { quota, active: count } = data.floorPlan;
  const full = quota !== null && count >= quota;
  const shown = active
    .filter((t) => t.zone_id === zone?.id)
    .map((t) => ({
      ...t,
      pos_x: moved[t.id]?.x ?? t.pos_x,
      pos_y: moved[t.id]?.y ?? t.pos_y,
      rotation: moved[t.id]?.rotation ?? t.rotation,
    }));
  const run = (p: Promise<void>) =>
    p.then(() => setError("")).catch((e: Error) => setError(e.message));
  // Affiche le geste tout de suite, puis laisse la donnée serveur reprendre la main.
  const gesture = (
    id: string,
    patch: { x?: number; y?: number; rotation?: number },
    p: () => Promise<void>,
  ) => {
    setMoved((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
    void run(p()).finally(() =>
      setMoved((m) => {
        const rest = { ...m };
        delete rest[id];
        return rest;
      }),
    );
  };
  const rotate = (t: { id: string }, rotation: number) =>
    gesture(t.id, { rotation }, () =>
      act({ action: "rotateTable", id: t.id, rotation }),
    );
  const upcoming = (t: Table) =>
    data.reservations.filter(
      (r) =>
        r.table_id === t.id &&
        ["requested", "confirmed", "arrived"].includes(r.status) &&
        new Date(r.ends_at).getTime() > Date.now(),
    ).length;
  const current = editing === "new" ? null : editing;
  const currentZone = zoneEdit === "new" ? null : zoneEdit;
  const zoneTables = (z: Zone) => active.filter((t) => t.zone_id === z.id);
  const removeZone = (z: Zone) => {
    const n = zoneTables(z).length;
    if (
      confirm(
        n
          ? `Supprimer la zone « ${z.name} » ? Ses ${n} table(s) sans historique seront supprimées ; une table avec historique doit d’abord être déplacée ou archivée.`
          : `Supprimer la zone « ${z.name} » ?`,
      )
    )
      void run(act({ action: "deleteZone", id: z.id })).then(() =>
        setZoneId(null),
      );
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Aménager la salle</h2>
          <p>
            Créez vos zones, glissez et tournez les tables pour reproduire
            l’établissement. Ce plan est celui que voient les clients au moment
            de réserver.
          </p>
        </div>
        <Button
          onClick={() => setEditing("new")}
          disabled={full || !zone}
          title={full ? "Plafond de tables de l’offre atteint" : undefined}
        >
          <Plus size={16} /> Ajouter une table
        </Button>
      </div>
      <p className={`floor-quota${full ? " full" : ""}`} role="status">
        {quota === null ? (
          <>
            <b>{count}</b> tables actives · sans plafond de tables
          </>
        ) : (
          <>
            <b>
              {count} / {quota}
            </b>{" "}
            tables actives, toutes zones confondues
            {full &&
              " : plafond atteint. Archivez une table ou choisissez un forfait supérieur pour en ajouter."}
          </>
        )}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="zone-bar">
        <div className="zone-switch" role="tablist" aria-label="Zones">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              role="tab"
              aria-selected={z.id === zone?.id}
              className={z.id === zone?.id ? "active" : ""}
              onClick={() => setZoneId(z.id)}
            >
              {z.name}
              <small>{zoneTables(z).length}</small>
            </button>
          ))}
          <button
            type="button"
            className="zone-add"
            onClick={() => setZoneEdit("new")}
          >
            <Plus size={14} /> Zone
          </button>
        </div>
        {zone && (
          <div className="zone-actions">
            <Button
              variant="ghost"
              aria-label={`Avancer la zone ${zone.name}`}
              disabled={zones[0]?.id === zone.id}
              onClick={() =>
                run(act({ action: "moveZone", id: zone.id, direction: -1 }))
              }
            >
              <ArrowLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              aria-label={`Reculer la zone ${zone.name}`}
              disabled={zones.at(-1)?.id === zone.id}
              onClick={() =>
                run(act({ action: "moveZone", id: zone.id, direction: 1 }))
              }
            >
              <ArrowRight size={14} />
            </Button>
            <Button variant="secondary" onClick={() => setZoneEdit(zone)}>
              <Pencil size={14} /> Renommer
            </Button>
            <Button
              variant="ghost"
              aria-label={`Supprimer la zone ${zone.name}`}
              disabled={zones.length < 2}
              onClick={() => removeZone(zone)}
            >
              <Trash2 size={14} /> Supprimer
            </Button>
          </div>
        )}
      </div>
      <ul className="map-legend">
        <li className="free">Libre</li>
        <li className="occupied">Occupée</li>
        <li className="cleaning">À nettoyer</li>
        <li className="unavailable">Indisponible</li>
      </ul>
      <FloorMap
        tables={shown}
        zone={zone?.name}
        entry={zone?.id === zones[0]?.id}
        stateOf={(t) =>
          (t.id === (current?.id ?? "") ? "selected " : "") +
          (data.tables.find((x) => x.id === t.id)?.status ?? "free")
        }
        caption={(t) =>
          `${statusLabels[data.tables.find((x) => x.id === t.id)?.status ?? ""] ?? ""} · glisser ou flèches pour déplacer, poignée ou R pour tourner, Entrée pour modifier`
        }
        onSelect={(t) => setEditing(data.tables.find((x) => x.id === t.id)!)}
        onMove={(t, x, y) =>
          gesture(t.id, { x, y }, () =>
            act({ action: "moveTable", id: t.id, x, y }),
          )
        }
        onRotate={rotate}
        hint={
          zone && !shown.length
            ? "Zone vide : ajoutez une table ou déplacez-en une ici"
            : null
        }
      />
      <p className="muted floor-help">
        Glissez une table pour la placer. Tirez la poignée ronde pour la tourner
        par pas de 15° (Maj pour un réglage au degré près), ou touche R / Maj+R
        au clavier.
      </p>
      <div className="card table-scroll floor-tables">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Zone</th>
              <th>Places</th>
              <th>Angle</th>
              <th>État</th>
              <th>En ligne</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {[...active, ...archived].map((t) => (
              <tr key={t.id} className={t.archived_at ? "archived" : ""}>
                <td>
                  <b>Table {t.number}</b>
                  {t.label && <small>{t.label}</small>}
                </td>
                <td>{t.zone}</td>
                <td>{t.capacity}</td>
                <td>{t.rotation}°</td>
                <td>
                  {t.archived_at ? (
                    <span className="badge cancelled">Archivée</span>
                  ) : (
                    <Badge status={t.status} />
                  )}
                  {upcoming(t) > 0 && (
                    <small>{upcoming(t)} réservation(s) à venir</small>
                  )}
                </td>
                <td>{t.bookable ? "Réservable" : "Masquée"}</td>
                <td>
                  <div className="actions">
                    {!t.archived_at ? (
                      <>
                        <Button
                          variant="secondary"
                          aria-label={`Modifier la table ${t.number}`}
                          onClick={() => setEditing(t)}
                        >
                          <Pencil size={14} /> Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`Tourner la table ${t.number} de 15°`}
                          onClick={() =>
                            rotate(t, normalizeAngle(t.rotation + 15))
                          }
                        >
                          <RotateCw size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`Archiver la table ${t.number}`}
                          onClick={() =>
                            run(
                              act({
                                action: "tableLifecycle",
                                id: t.id,
                                operation: "archive",
                              }),
                            )
                          }
                        >
                          <Archive size={14} /> Archiver
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        aria-label={`Restaurer la table ${t.number}`}
                        disabled={full}
                        onClick={() =>
                          run(
                            act({
                              action: "tableLifecycle",
                              id: t.id,
                              operation: "restore",
                            }),
                          )
                        }
                      >
                        <RotateCcw size={14} /> Restaurer
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      aria-label={`Supprimer la table ${t.number}`}
                      onClick={() => {
                        if (
                          confirm(
                            `Supprimer définitivement la table ${t.number} ? Une table avec historique doit être archivée.`,
                          )
                        )
                          void run(
                            act({
                              action: "tableLifecycle",
                              id: t.id,
                              operation: "delete",
                            }),
                          );
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {zoneEdit && (
        <Modal
          title={
            currentZone
              ? `Renommer la zone ${currentZone.name}`
              : "Nouvelle zone"
          }
          close={() => setZoneEdit(null)}
        >
          <Form
            label={currentZone ? "Renommer" : "Créer la zone"}
            fields={[
              {
                name: "name",
                label: "Nom de la zone",
                value: currentZone?.name ?? "",
              },
            ]}
            onSubmit={async (v) => {
              await act({
                action: "saveZone",
                id: currentZone?.id,
                name: v.name,
              });
              setZoneEdit(null);
            }}
          />
          {!currentZone && (
            <p className="muted">
              Exemples : Terrasse, Étage, Bar, Salon privé. Chaque zone a son
              propre plan.
            </p>
          )}
        </Modal>
      )}
      {editing && (
        <Modal
          title={
            current ? `Modifier la table ${current.number}` : "Nouvelle table"
          }
          close={() => setEditing(null)}
        >
          {current?.status === "occupied" && (
            <p className="muted">
              Table en service : son état repassera « À nettoyer » à la clôture
              de l’addition.
            </p>
          )}
          <Form
            label={current ? "Enregistrer la table" : "Ajouter au plan"}
            fields={[
              {
                name: "number",
                label: "Numéro",
                type: "number",
                min: 1,
                value:
                  current?.number ??
                  Math.max(0, ...data.tables.map((t) => t.number)) + 1,
              },
              {
                name: "capacity",
                label: "Nombre de places",
                type: "number",
                min: 1,
                value: current?.capacity ?? 4,
              },
              {
                name: "zoneId",
                label: "Zone",
                options: zones.map((z) => ({ value: z.id, label: z.name })),
                value: current?.zone_id ?? zone?.id ?? "",
              },
              {
                name: "label",
                label: "Nom affiché (facultatif)",
                value: current?.label ?? "",
                required: false,
              },
              {
                name: "shape",
                label: "Forme",
                options: shapes,
                value: current?.shape ?? "square",
              },
              {
                name: "rotation",
                label: "Rotation (degrés, sens horaire)",
                type: "number",
                min: 0,
                step: "1",
                value: current?.rotation ?? 0,
              },
              ...(current && current.status !== "occupied"
                ? [
                    {
                      name: "status",
                      label: "État",
                      options: statuses,
                      value: current.status,
                    },
                  ]
                : []),
              {
                name: "bookable",
                label: "Réservation en ligne",
                options: [
                  { value: "true", label: "Proposée aux clients" },
                  { value: "false", label: "Masquée (réservée au personnel)" },
                ],
                value: String(current?.bookable ?? true),
              },
            ]}
            onSubmit={async (v) => {
              await act({
                action: "saveTable",
                id: current?.id,
                number: v.number,
                capacity: v.capacity,
                zoneId: v.zoneId,
                label: v.label,
                shape: v.shape,
                rotation: normalizeAngle(Number(v.rotation) || 0),
                status: v.status || undefined,
                bookable: v.bookable === "true",
              });
              if (!current) setZoneId(v.zoneId);
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
