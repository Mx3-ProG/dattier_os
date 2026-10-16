"use client";
import { Recipes } from "./recipes";
import { Catalog } from "./catalog";
import { Customers } from "./customers";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import { money, dateTime } from "@/lib/domain";
import { roleLabels } from "@/lib/permissions";
import { Button } from "./ui/button";
import { Form, Modal, Badge, type Act, type Field } from "./forms";
type Editor = {
  title: string;
  fields: Field[];
  submit: (v: Record<string, string>) => Promise<void>;
};
const options = (items: { id: string; name: string }[]) =>
  items.map((i) => ({ value: i.id, label: i.name }));
export function Management({
  module,
  data,
  act,
}: {
  module: string;
  data: Snapshot;
  act: Act;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null),
    [query, setQuery] = useState("");
  const edit = (title: string, fields: Field[], submit: Editor["submit"]) =>
    setEditor({ title, fields, submit });
  const matches = (s: string) => s.toLowerCase().includes(query.toLowerCase());
  let body: React.ReactNode = null;
  if (module === "stocks")
    body = (
      <>
        <div className="section-heading">
          <h2>Des stocks maîtrisés, un service serein.</h2>
          <span className="pill">Lots expirés exclus du disponible</span>
        </div>
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ingrédient</th>
                <th>Physique</th>
                <th>Réservé</th>
                <th>Disponible</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {data.ingredients
                .filter((i) => matches(i.name))
                .map((i) => (
                  <tr key={i.id}>
                    <td>
                      <b>{i.name}</b>
                    </td>
                    <td>
                      {i.physical} {i.unit}
                    </td>
                    <td>
                      {i.reserved} {i.unit}
                    </td>
                    <td>
                      <b>
                        {i.available} {i.unit}
                      </b>
                    </td>
                    <td>
                      <span
                        className={`badge ${i.available <= i.threshold ? "waiting" : "ready"}`}
                      >
                        {i.available <= i.threshold
                          ? "À surveiller"
                          : "Disponible"}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <h2>Lots & inventaire</h2>
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Lot / ingrédient</th>
                <th>Date limite</th>
                <th>Quantité</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.lots
                .filter((l) => matches(l.name))
                .map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.name}
                      <small>
                        {l.id.slice(0, 22)} · {l.location}
                      </small>
                    </td>
                    <td>
                      {String(l.expires_on).slice(0, 10)}
                      {new Date(l.expires_on).getTime() <
                        new Date(data.now).getTime() - 86400000 && (
                        <span className="badge cancelled">Expiré</span>
                      )}
                    </td>
                    <td>
                      {l.quantity} {l.unit}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          edit(
                            "Déclarer une perte",
                            [
                              {
                                name: "quantity",
                                label: `Quantité perdue (${l.unit})`,
                                type: "number",
                                min: 0,
                                step: "any",
                              },
                              { name: "reason", label: "Motif" },
                            ],
                            (v) =>
                              act({
                                action: "stock",
                                id: l.id,
                                kind: "waste",
                                ...v,
                              }),
                          )
                        }
                      >
                        Perte
                      </Button>
                      {[
                        "OWNER",
                        "SUPER_ADMIN",
                        "MANAGER",
                        "STOCK_MANAGER",
                      ].includes(data.user.role) && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            edit(
                              "Compter ce lot",
                              [
                                {
                                  name: "quantity",
                                  label: `Quantité réellement comptée (${l.unit})`,
                                  type: "number",
                                  value: l.quantity,
                                  min: 0,
                                  step: "any",
                                },
                                {
                                  name: "reason",
                                  label: "Motif de correction",
                                },
                              ],
                              (v) =>
                                act({
                                  action: "stock",
                                  id: l.id,
                                  kind: "inventory",
                                  ...v,
                                }),
                            )
                          }
                        >
                          Inventaire
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <h2>Mouvements récents</h2>
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ingrédient</th>
                <th>Type</th>
                <th>Quantité</th>
                <th>Motif</th>
              </tr>
            </thead>
            <tbody>
              {data.movements
                .filter((m) => matches(m.name))
                .map((m) => (
                  <tr key={m.id}>
                    <td>{dateTime(m.created_at)}</td>
                    <td>{m.name}</td>
                    <td>{m.type}</td>
                    <td>{m.quantity}</td>
                    <td>{m.reason}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (module === "reservations")
    body = (
      <>
        <div className="section-heading">
          <h2>Les prochaines tablées</h2>
          <Link href="/reservations" target="_blank">
            Ouvrir le formulaire public ↗
          </Link>
        </div>
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Créneau</th>
                <th>Couverts</th>
                <th>Table</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.reservations
                .filter((r) => matches(r.name))
                .map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.name}</b>
                      <small>{r.contact}</small>
                      {r.note}
                    </td>
                    <td>{dateTime(r.starts_at)}</td>
                    <td>{r.guests}</td>
                    <td>
                      {data.tables.find((t) => t.id === r.table_id)?.number ||
                        "À affecter"}
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      {["requested", "confirmed", "arrived"].includes(
                        r.status,
                      ) && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            edit(
                              "Gérer la réservation",
                              [
                                {
                                  name: "status",
                                  label: "Statut",
                                  options: (r.status === "requested"
                                    ? ["confirmed", "declined", "cancelled"]
                                    : r.status === "confirmed"
                                      ? [
                                          "confirmed",
                                          "arrived",
                                          "no_show",
                                          "cancelled",
                                        ]
                                      : ["cancelled"]
                                  ).map((s) => ({
                                    value: s,
                                    label: (
                                      {
                                        confirmed: "Confirmer",
                                        arrived: "Arrivé",
                                        declined: "Refuser",
                                        cancelled: "Annuler",
                                        no_show: "Absent",
                                      } as Record<string, string>
                                    )[s],
                                  })),
                                },
                                {
                                  name: "table",
                                  label: "Table",
                                  value: r.table_id || "",
                                  options: [
                                    { value: "", label: "Non affectée" },
                                    ...data.tables
                                      .filter(
                                        (t) =>
                                          !t.archived_at || t.id === r.table_id,
                                      )
                                      .map((t) => ({
                                        value: t.id,
                                        label: `Table ${t.number} · ${t.capacity} places`,
                                      })),
                                  ],
                                  required: false,
                                },
                              ],
                              (v) =>
                                act({
                                  action: "reservation",
                                  id: r.id,
                                  ...v,
                                  table: v.table || undefined,
                                }),
                            )
                          }
                        >
                          Gérer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (module === "suppliers" || module === "deliveries")
    body = (
      <>
        <div className="section-heading">
          <h2>
            {module === "suppliers"
              ? "Nos partenaires de cuisine"
              : "Approvisionnements & réceptions"}
          </h2>
          <div className="actions">
            <Button
              variant="secondary"
              onClick={() =>
                edit(
                  "Ajouter un fournisseur",
                  [
                    { name: "name", label: "Nom" },
                    { name: "contact", label: "Contact" },
                  ],
                  (v) => act({ action: "supplier", ...v }),
                )
              }
            >
              Ajouter un fournisseur
            </Button>
            <Button
              onClick={() =>
                edit(
                  "Commander un ingrédient",
                  [
                    {
                      name: "supplier",
                      label: "Fournisseur",
                      options: options(data.suppliers),
                    },
                    {
                      name: "ingredient",
                      label: "Ingrédient · unité de référence",
                      options: data.ingredients.map((i) => ({
                        value: i.id,
                        label: `${i.name} (${i.unit})`,
                      })),
                    },
                    {
                      name: "quantity",
                      label: "Quantité",
                      type: "number",
                      min: 1,
                    },
                    { name: "due", label: "Livraison prévue", type: "date" },
                  ],
                  (v) => act({ action: "purchase", ...v }),
                )
              }
            >
              Nouvel approvisionnement
            </Button>
          </div>
        </div>
        {module === "suppliers" && (
          <div className="three-grid">
            {data.suppliers
              .filter((s) => matches(s.name))
              .map((s) => (
                <article key={s.id} className="card">
                  <span className="eyebrow">FOURNISSEUR FICTIF</span>
                  <h3>{s.name}</h3>
                  <p>{s.contact}</p>
                  <small>Délai indicatif : {s.lead_days} jours</small>
                </article>
              ))}
          </div>
        )}
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th>Produit</th>
                <th>Prévu</th>
                <th>Reçu</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.purchases.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.ingredient_name}</td>
                  <td>
                    {p.quantity} {p.unit}
                  </td>
                  <td>
                    {p.received} {p.unit}
                  </td>
                  <td>{String(p.due_on).slice(0, 10)}</td>
                  <td>
                    <Badge status={p.status} />
                  </td>
                  <td>
                    {p.received < p.quantity && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          edit(
                            "Réceptionner la livraison",
                            [
                              {
                                name: "quantity",
                                label: `Quantité reçue (${p.unit}) · restant ${p.quantity - p.received}`,
                                type: "number",
                                min: 1,
                                value: p.quantity - p.received,
                              },
                              {
                                name: "expires",
                                label: "Date limite du lot",
                                type: "date",
                              },
                            ],
                            (v) => act({ action: "receive", id: p.id, ...v }),
                          )
                        }
                      >
                        Réceptionner
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Les commandes sont enregistrées localement. Aucun bon n’est envoyé au
          fournisseur.
        </p>
      </>
    );
  if (module === "team")
    body = (
      <>
        <div className="section-heading">
          <h2>L’équipe & les services</h2>
          <Button
            onClick={() =>
              edit(
                "Planifier un service",
                [
                  {
                    name: "profile",
                    label: "Employé",
                    options: options(data.employees),
                  },
                  { name: "start", label: "Début", type: "datetime-local" },
                  { name: "end", label: "Fin", type: "datetime-local" },
                ],
                (v) =>
                  act({
                    action: "shift",
                    profile: v.profile,
                    start: new Date(v.start).toISOString(),
                    end: new Date(v.end).toISOString(),
                  }),
              )
            }
          >
            Planifier un service
          </Button>
        </div>
        <div className="three-grid">
          {data.employees
            .filter((p) => matches(p.name))
            .map((p) => (
              <article className="card employee" key={p.id}>
                <span className="avatar">{p.name.slice(0, 2)}</span>
                <div>
                  <h3>{p.name}</h3>
                  <small>{roleLabels[p.role]} · profil fictif</small>
                </div>
              </article>
            ))}
        </div>
        <h2>Planning</h2>
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Équipier</th>
                <th>Début</th>
                <th>Fin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.shifts.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{dateTime(s.starts_at)}</td>
                  <td>{dateTime(s.ends_at)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Supprimer ce créneau ?"))
                          void act({ action: "deleteShift", id: s.id });
                      }}
                    >
                      Supprimer
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (module === "attendance")
    body = (
      <>
        <h2>Mon service</h2>
        <p>Suivi opérationnel des heures, sans calcul de paie.</p>
        <div className="actions">
          {[
            { event: "start", label: "Début de service" },
            { event: "break", label: "Début de pause" },
            { event: "resume", label: "Fin de pause" },
            { event: "end", label: "Fin de service" },
          ].map((e) => (
            <Button
              key={e.event}
              variant="secondary"
              onClick={() => act({ action: "clock", event: e.event })}
            >
              {e.label}
            </Button>
          ))}
        </div>
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Personne</th>
                <th>Événement</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.timeEntries.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.event}</td>
                  <td>{dateTime(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (module === "customers") body = <Customers data={data} act={act} />;
  if (module === "menu") body = <Catalog data={data} act={act} />;
  if (module === "recipes")
    body = <Recipes data={data} act={act} query={query} />;
  if (module === "activity")
    body = (
      <>
        <h2>Le fil du restaurant</h2>
        <div className="card timeline">
          {data.audit
            .filter((e) => matches(e.action + " " + e.name))
            .map((e) => (
              <div key={e.id}>
                <span className="timeline-dot" />
                <div>
                  <b>{e.action}</b>
                  <small>
                    {e.name} · {dateTime(e.created_at)}{" "}
                    {e.object_id && `· #${e.object_id.slice(0, 6)}`}
                  </small>
                </div>
              </div>
            ))}
        </div>
      </>
    );
  if (module === "settings")
    body = (
      <>
        <h2>Votre établissement</h2>
        <div className="two-grid">
          <div className="card">
            <Form
              fields={[
                { name: "name", label: "Nom", value: data.restaurant.name },
                {
                  name: "address",
                  label: "Adresse",
                  value: data.restaurant.address,
                },
                {
                  name: "phone",
                  label: "Téléphone",
                  value: data.restaurant.phone,
                  required: false,
                },
                {
                  name: "goal",
                  label: "Objectif journalier (centimes)",
                  type: "number",
                  value: data.restaurant.goal,
                },
              ]}
              onSubmit={(v) => act({ action: "restaurant", ...v })}
            />
          </div>
          <div className="card">
            <h3>Les établissements</h3>
            {data.restaurants.map((r) => (
              <p key={r.id}>{r.name}</p>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                edit(
                  "Ajouter un établissement",
                  [{ name: "name", label: "Nom" }],
                  (v) => act({ action: "addRestaurant", ...v }),
                )
              }
            >
              Ajouter un établissement
            </Button>
            <p className="muted">
              Un nouvel établissement démarre vide. La création de sa carte, de
              ses stocks et de ses tables nécessite encore une initialisation
              technique.
            </p>
            <h3>Démonstration</h3>
            <p>
              La réinitialisation restaure les deux établissements fictifs et
              déconnecte les profils.
            </p>
            <Button
              variant="danger"
              onClick={async () => {
                if (
                  confirm(
                    "Réinitialiser toutes les données de démonstration ? Cette action supprime les modifications locales.",
                  )
                ) {
                  const r = await fetch("/api/v1/reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ confirm: "RESET DEMO" }),
                  });
                  if (r.ok) router.push("/demo");
                  else alert((await r.json()).error);
                }
              }}
            >
              Réinitialiser les données de démonstration
            </Button>
          </div>
        </div>
      </>
    );
  if (module === "expenses")
    body = (
      <>
        <div className="section-heading">
          <h2>Dépenses opérationnelles</h2>
          <Button
            onClick={() =>
              edit(
                "Enregistrer une dépense",
                [
                  { name: "label", label: "Libellé" },
                  {
                    name: "amount",
                    label: "Montant en centimes",
                    type: "number",
                    min: 1,
                  },
                ],
                (v) => act({ action: "expense", ...v }),
              )
            }
          >
            Ajouter une dépense
          </Button>
        </div>
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th>Montant déclaré</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((e) => (
                <tr key={e.id}>
                  <td>{dateTime(e.created_at)}</td>
                  <td>{e.label}</td>
                  <td>{money(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.expenses.length && (
            <p className="empty">Aucune dépense enregistrée.</p>
          )}
        </div>
      </>
    );
  return (
    <>
      {!["menu", "customers"].includes(module) && (
        <input
          className="search module-search"
          placeholder="Filtrer cette vue…"
          aria-label="Filtrer cette vue"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {body}
      {editor && (
        <Modal title={editor.title} close={() => setEditor(null)}>
          <Form
            fields={editor.fields}
            onSubmit={async (v) => {
              await editor.submit(v);
              setEditor(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
