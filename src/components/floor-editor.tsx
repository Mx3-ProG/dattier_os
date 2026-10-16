"use client";
import { useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Snapshot, Table } from "@/lib/types";
import { Button } from "./ui/button";
import { Badge, Form, Modal, statusLabels, type Act } from "./forms";
import { FloorMap } from "./floor-map";

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

/** Aménagement : ajouter, modifier, déplacer, archiver ou supprimer des tables. */
export function FloorEditor({ data, act }: { data: Snapshot; act: Act }) {
  const [editing, setEditing] = useState<Table | "new" | null>(null),
    // Position affichée pendant l’enregistrement d’un déplacement.
    [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({}),
    [error, setError] = useState("");
  const active = data.tables.filter((t) => !t.archived_at),
    archived = data.tables.filter((t) => t.archived_at);
  const zones = [...new Set(data.tables.map((t) => t.zone))];
  const shown = active.map((t) =>
    moved[t.id] ? { ...t, pos_x: moved[t.id].x, pos_y: moved[t.id].y } : t,
  );
  const run = (p: Promise<void>) =>
    p.then(() => setError("")).catch((e: Error) => setError(e.message));
  const upcoming = (t: Table) =>
    data.reservations.filter(
      (r) =>
        r.table_id === t.id &&
        ["requested", "confirmed", "arrived"].includes(r.status) &&
        new Date(r.ends_at).getTime() > Date.now(),
    ).length;
  const current = editing === "new" ? null : editing;
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Aménager la salle</h2>
          <p>
            Glissez les tables pour reproduire la salle. Ce plan est celui que
            voient les clients au moment de réserver.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} /> Ajouter une table
        </Button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="map-legend">
        <li className="free">Libre</li>
        <li className="occupied">Occupée</li>
        <li className="cleaning">À nettoyer</li>
        <li className="unavailable">Indisponible</li>
      </ul>
      <FloorMap
        tables={shown}
        stateOf={(t) =>
          (t.id === (current?.id ?? "") ? "selected " : "") +
          (data.tables.find((x) => x.id === t.id)?.status ?? "free")
        }
        caption={(t) =>
          `${statusLabels[data.tables.find((x) => x.id === t.id)?.status ?? ""] ?? ""} · glisser ou flèches pour déplacer, Entrée pour modifier`
        }
        onSelect={(t) => setEditing(data.tables.find((x) => x.id === t.id)!)}
        onMove={(t, x, y) => {
          setMoved((m) => ({ ...m, [t.id]: { x, y } }));
          void run(act({ action: "moveTable", id: t.id, x, y })).finally(() =>
            setMoved((m) => {
              const rest = { ...m };
              delete rest[t.id];
              return rest;
            }),
          );
        }}
      />
      <div className="card table-scroll floor-tables">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Zone</th>
              <th>Places</th>
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
                name: "zone",
                label: "Zone",
                value: current?.zone ?? zones[0] ?? "Salle principale",
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
                zone: v.zone,
                label: v.label,
                shape: v.shape,
                status: v.status || undefined,
                bookable: v.bookable === "true",
              });
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
