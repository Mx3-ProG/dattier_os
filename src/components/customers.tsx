"use client";
import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import { money } from "@/lib/domain";
import { Button } from "./ui/button";
import { Mail, MessageSquare } from "lucide-react";
import { Form, Modal, type Field, type Act } from "./forms";
import { QrButton } from "./qr/qr-portfolio";
import {
  MessageComposer,
  contactsOf,
  type SendResult,
} from "./customer-message";
import type { Channel } from "@/features/messaging/contact";
const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Customers({ data, act }: { data: Snapshot; act: Act }) {
  // Member card scanned by the team: the customer is highlighted (?focus=<id>).
  const focus =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("focus");
  const [editor, setEditor] = useState<{
      title: string;
      fields: Field[];
      submit: (v: Record<string, string>) => Promise<void>;
    } | null>(null),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [composer, setComposer] = useState<{
      id: string;
      channel: Channel;
    } | null>(null);
  const composing = composer
    ? data.customers.find((c) => c.id === composer.id)
    : undefined;
  const history = data.customerMessages ?? [];
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
  function gamification() {
    const g = data.engagement;
    if (!g) return;
    const slots = [0, 1, 2];
    setEditor({
      title: "Gamification du compte client",
      fields: [
        {
          name: "points_per_euro",
          label: "Points gagnés par euro commandé en ligne",
          type: "number",
          min: 0,
          step: "0.1",
          value: g.points_per_euro,
        },
        {
          name: "booking_points",
          label: "Points offerts à l’arrivée après une réservation",
          type: "number",
          min: 0,
          value: g.booking_points,
        },
        {
          name: "referrer_points",
          label: "Points du parrain à la 1re commande de son filleul",
          type: "number",
          min: 0,
          value: g.referrer_points,
        },
        {
          name: "welcome_kind",
          label: "Cadeau de bienvenue du filleul",
          value: g.welcome_kind,
          options: [
            { value: "fixed", label: "Montant fixe (€)" },
            { value: "percent", label: "Pourcentage (%)" },
          ],
        },
        {
          name: "welcome_value",
          label: "Valeur du cadeau (€ ou %, 0 pour aucun)",
          type: "number",
          min: 0,
          step: "0.01",
          value:
            g.welcome_kind === "fixed"
              ? g.welcome_value / 100
              : g.welcome_value,
        },
        {
          name: "welcome_days",
          label: "Validité du cadeau de bienvenue (jours)",
          type: "number",
          min: 1,
          value: g.welcome_days,
        },
        ...slots.flatMap((n) => [
          {
            name: `m${n}_count`,
            label: `Palier ${n + 1} · nombre d’amis (0 pour retirer)`,
            type: "number",
            min: 0,
            value: g.milestones[n]?.count ?? 0,
          },
          {
            name: `m${n}_points`,
            label: `Palier ${n + 1} · points bonus`,
            type: "number",
            min: 0,
            value: g.milestones[n]?.points ?? 0,
          },
          {
            name: `m${n}_label`,
            label: `Palier ${n + 1} · cadeau affiché`,
            required: false,
            value: g.milestones[n]?.label ?? "",
          },
        ]),
      ],
      submit: (v) =>
        act({
          action: "engagementSettings",
          points_per_euro: Number(v.points_per_euro),
          booking_points: Number(v.booking_points),
          referrer_points: Number(v.referrer_points),
          welcome_kind: v.welcome_kind,
          welcome_value:
            v.welcome_kind === "fixed"
              ? Math.round(Number(v.welcome_value) * 100)
              : Number(v.welcome_value),
          welcome_days: Number(v.welcome_days),
          milestones: slots
            .map((n) => ({
              count: Number(v[`m${n}_count`]),
              points: Number(v[`m${n}_points`]),
              label: v[`m${n}_label`]?.trim() || "Cadeau de palier",
            }))
            .filter((m) => m.count > 0),
        }),
    });
  }
  return (
    <>
      {data.engagement && (
        <section className="card engagement-card">
          <div>
            <span className="eyebrow">Compte client gamifié</span>
            <h3>Points, parrainage et paliers</h3>
            <p className="muted">
              {data.engagement.points_per_euro} pt / € commandé ·{" "}
              {data.engagement.booking_points} pts à l’arrivée après réservation
              · parrain +{data.engagement.referrer_points} pts · filleul{" "}
              {data.engagement.welcome_value
                ? data.engagement.welcome_kind === "fixed"
                  ? `${money(data.engagement.welcome_value)} offerts`
                  : `${data.engagement.welcome_value} % offerts`
                : "sans cadeau"}
            </p>
            <p className="muted">
              Paliers :{" "}
              {data.engagement.milestones
                .map((m) => `${m.count} amis → +${m.points} pts (${m.label})`)
                .join(" · ") || "aucun"}
            </p>
          </div>
          <Button variant="secondary" onClick={gamification}>
            Régler la gamification
          </Button>
        </section>
      )}
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
              <th>Dernier message</th>
              <th>Contacter</th>
              <th>Fidélité</th>
            </tr>
          </thead>
          <tbody>
            {data.customers
              .filter((c) =>
                (c.name + " " + c.contact)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((c) => {
                const k = contactsOf(c);
                return (
                  <tr
                    key={c.id}
                    className={focus === c.id ? "is-focus" : ""}
                    ref={(el) => {
                      if (el && focus === c.id)
                        el.scrollIntoView({ block: "center" });
                    }}
                  >
                    <td>
                      <QrButton
                        restaurant={data.restaurant.id}
                        kind="customer"
                        refId={c.id}
                        label={`Carte membre ${c.name}`}
                      />{" "}
                      {c.name}
                    </td>
                    <td>{c.contact}</td>
                    <td>{k.consent ? "Accord recueilli" : "Non"}</td>
                    <td>{c.points}</td>
                    <td>
                      {c.last_message_at ? when(c.last_message_at) : "Jamais"}
                    </td>
                    <td className="contact-actions">
                      <Button
                        variant="secondary"
                        disabled={!k.email}
                        title={k.email ?? "Aucune adresse email sur la fiche"}
                        onClick={() =>
                          setComposer({ id: c.id, channel: "email" })
                        }
                      >
                        <Mail size={14} /> Email
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!k.phone}
                        title={k.phone ?? "Aucun numéro de mobile sur la fiche"}
                        onClick={() =>
                          setComposer({ id: c.id, channel: "sms" })
                        }
                      >
                        <MessageSquare size={14} /> SMS
                      </Button>
                    </td>
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
                );
              })}
          </tbody>
        </table>
      </div>
      <h2>Messages envoyés</h2>
      <p className="muted">
        Relances, offres et informations envoyées depuis la fiche client. Les
        relances et offres exigent l’accord du client et portent une mention de
        désinscription.
        {data.messaging &&
          !(data.messaging.email && data.messaging.sms) &&
          ` ${[!data.messaging.email && "Email", !data.messaging.sms && "SMS"]
            .filter(Boolean)
            .join(
              " et ",
            )} en mode démo : les envois sont tracés mais ne partent pas tant que le fournisseur n’est pas branché.`}
      </p>
      {history.length ? (
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Canal</th>
                <th>Intention</th>
                <th>Message</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {history
                .filter((m) =>
                  (m.customer_name + " " + m.recipient)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((m) => (
                  <tr key={m.id}>
                    <td>{when(m.created_at)}</td>
                    <td>
                      {m.customer_name}
                      <br />
                      <small className="muted">{m.recipient}</small>
                    </td>
                    <td>{m.channel === "email" ? "Email" : "SMS"}</td>
                    <td>
                      {m.purpose === "relance"
                        ? "Relance"
                        : m.purpose === "offre"
                          ? "Offre"
                          : "Information"}
                    </td>
                    <td className="message-preview" title={m.body}>
                      {m.subject && <b>{m.subject} · </b>}
                      {m.body.slice(0, 90)}
                      {m.body.length > 90 ? "…" : ""}
                    </td>
                    <td>
                      <span
                        className="badge"
                        title={m.error ?? m.actor_name ?? undefined}
                      >
                        {m.status === "sent"
                          ? "Envoyé"
                          : m.status === "demo"
                            ? "Démo"
                            : "Échec"}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          Aucun message envoyé. Utilisez Email ou SMS sur une fiche client.
        </p>
      )}
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
      {composer && composing && (
        <Modal
          title={`Contacter ${composing.name}`}
          description="Choisissez l’intention : le message est pré-rédigé, modifiez-le si besoin puis envoyez."
          close={() => setComposer(null)}
        >
          <MessageComposer
            key={composing.id}
            data={data}
            customer={composing}
            channel={composer.channel}
            send={(m) => act(m) as Promise<unknown> as Promise<SendResult>}
            done={(note) => {
              setMessage(note);
              setComposer(null);
            }}
          />
        </Modal>
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
