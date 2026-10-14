"use client";
import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import { money } from "@/lib/domain";
import { Button } from "./ui/button";
import { Form, Modal, type Field, type Act } from "./forms";
export function Customers({ data, act }: { data: Snapshot; act: Act }) {
  const [editor, setEditor] = useState<{
      title: string;
      fields: Field[];
      submit: (v: Record<string, string>) => Promise<void>;
    } | null>(null),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState("");
  function issue(customer?: string) {
    setEditor({
      title: "Créer un code promo nominatif",
      fields: [
        {
          name: "customer",
          label: "Client titulaire",
          value: customer,
          options: data.customers.map((c) => ({
            value: c.id,
            label: `${c.name} · ${c.points} points`,
          })),
        },
        { name: "code", label: "Code unique (lettres, chiffres, tirets)" },
        {
          name: "kind",
          label: "Type de remise",
          options: [
            { value: "percent", label: "Pourcentage (%)" },
            { value: "fixed", label: "Montant fixe (€)" },
          ],
        },
        {
          name: "value",
          label: "Valeur (% ou € selon le type)",
          type: "number",
          min: 0.01,
          step: "0.01",
        },
        {
          name: "points",
          label: "Points à échanger (0 pour offrir le code)",
          type: "number",
          min: 0,
          value: 0,
        },
        { name: "expires", label: "Valable jusqu’au", type: "date" },
      ],
      submit: (v) =>
        act({
          action: "issuePromo",
          ...v,
          value:
            v.kind === "fixed"
              ? Math.round(Number(v.value) * 100)
              : Number(v.value),
        }),
    });
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Clients & avantages de fidélité</h2>
          <p>
            Un code personnel, une utilisation. Les points sont déduits lors de
            l’attribution.
          </p>
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            onClick={() =>
              setEditor({
                title: "Créer une fiche client",
                fields: [
                  { name: "name", label: "Nom" },
                  { name: "contact", label: "Contact" },
                  {
                    name: "consent",
                    label: "Consentement fidélité recueilli",
                    options: [
                      { value: "false", label: "Non" },
                      { value: "true", label: "Oui" },
                    ],
                  },
                ],
                submit: (v) =>
                  act({
                    action: "customer",
                    ...v,
                    consent: v.consent === "true",
                  }),
              })
            }
          >
            Ajouter un client
          </Button>
          <Button disabled={!data.customers.length} onClick={() => issue()}>
            Créer un code promo
          </Button>
        </div>
      </div>
      <input
        className="module-search"
        aria-label="Rechercher un client ou un code"
        placeholder="Client ou code promo…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {message && (
        <p role="status" className="note">
          {message}
        </p>
      )}
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Contact</th>
              <th>Consentement</th>
              <th>Points</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.customers
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.contact}</td>
                  <td>{c.consent ? "Accord recueilli" : "Non"}</td>
                  <td>{c.points}</td>
                  <td>
                    <Button
                      variant="ghost"
                      disabled={!c.consent}
                      onClick={() =>
                        setEditor({
                          title: "Mouvement de fidélité",
                          fields: [
                            {
                              name: "points",
                              label: "Points à ajouter ou retirer",
                              type: "number",
                            },
                            { name: "reason", label: "Motif" },
                          ],
                          submit: (v) =>
                            act({ action: "loyalty", id: c.id, ...v }),
                        })
                      }
                    >
                      Ajuster les points
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!c.consent}
                      onClick={() => issue(c.id)}
                    >
                      Offrir un code
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <h2>Codes attribués</h2>
      <p className="muted">
        Partagez la fiche privée au titulaire pour qu’il consulte son code. Le
        lien donne accès à cet avantage : ne le publiez pas. Aucun message
        automatique n’est envoyé.
      </p>
      <div className="three-grid">
        {data.promos
          .filter((p) =>
            (p.customer_name + " " + p.code)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((p) => (
            <article className="card" key={p.id}>
              <span className="eyebrow">{p.customer_name}</span>
              <h3>{p.code}</h3>
              <p>
                <b>
                  {p.kind === "percent" ? `${p.value} %` : money(p.value)} de
                  remise
                </b>
              </p>
              <small>
                {p.points_cost} points échangés · valable jusqu’au{" "}
                {p.expires_on.slice(0, 10)}
              </small>
              <p>
                <span className="badge">
                  {p.status === "redeemed"
                    ? "Utilisé"
                    : p.status === "cancelled"
                      ? "Annulé"
                      : p.expired
                        ? "Expiré"
                        : "Disponible"}
                </span>
              </p>
              <div className="actions">
                <a
                  className="btn secondary"
                  href={`/avantage?token=${p.token}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Voir la fiche client ↗
                </a>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/avantage?token=${p.token}`,
                      );
                      setMessage(
                        "Lien privé copié. Vous pouvez le transmettre au client.",
                      );
                    } catch {
                      setMessage(
                        "Copie indisponible. Ouvrez la fiche et copiez son adresse.",
                      );
                    }
                  }}
                >
                  Copier le lien
                </Button>
                {p.status === "active" && (
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (
                        confirm(
                          "Annuler ce code et restituer les points au client ?",
                        )
                      ) {
                        try {
                          await act({ action: "cancelPromo", id: p.id });
                        } catch (e) {
                          setMessage((e as Error).message);
                        }
                      }
                    }}
                  >
                    Annuler et restituer les points
                  </Button>
                )}
              </div>
            </article>
          ))}
      </div>
      {!data.promos.length && (
        <p className="empty">Aucun code attribué pour le moment.</p>
      )}
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
