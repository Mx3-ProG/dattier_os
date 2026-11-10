"use client";
import { useState } from "react";
import { Mail, MessageSquare } from "lucide-react";
import type { Customer, Promo, Snapshot } from "@/lib/types";
import { money } from "@/lib/domain";
import {
  asEmail,
  asPhone,
  commercial,
  draft,
  optOut,
  purposes,
  type Channel,
  type Purpose,
} from "@/features/messaging/contact";
import { Button } from "./ui/button";

export type SendResult = {
  status: "demo" | "sent" | "error";
  channel: Channel;
  recipient: string;
  error?: string;
};

export const contactsOf = (c: Customer) => ({
  email: asEmail(c.contact) ?? asEmail(c.account_email),
  phone: asPhone(c.contact),
  consent: c.consent || !!c.marketing_consent,
});

/** Fenêtre d’envoi : canal, intention pré-rédigée, texte modifiable, puis un clic. */
export function MessageComposer({
  data,
  customer,
  channel: initialChannel,
  initialPurpose = "relance",
  send,
  done,
}: {
  data: Snapshot;
  customer: Customer;
  channel: Channel;
  initialPurpose?: Purpose;
  send: (m: Record<string, unknown>) => Promise<SendResult | undefined>;
  done: (note: string) => void;
}) {
  const contacts = contactsOf(customer);
  const offers = data.promos.filter(
    (p) => p.customer_id === customer.id && p.status === "active" && !p.expired,
  );
  const [channel, setChannel] = useState<Channel>(initialChannel),
    [purpose, setPurpose] = useState<Purpose>(
      contacts.consent ? initialPurpose : "information",
    ),
    [promoId, setPromoId] = useState(offers[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const compose = (ch: Channel, pu: Purpose, promo?: Promo) =>
    draft(pu, ch, {
      firstName: customer.name.split(/\s+/)[0] || customer.name,
      restaurant: data.restaurant.name,
      points: customer.points,
      code: promo?.code,
      discount: promo
        ? promo.kind === "percent"
          ? `${promo.value} %`
          : money(promo.value)
        : undefined,
      link: promo
        ? `${window.location.origin}/avantage?token=${promo.token}`
        : undefined,
    });
  const promo = offers.find((p) => p.id === promoId);
  const [text, setText] = useState(() =>
    compose(channel, purpose, purpose === "offre" ? promo : undefined),
  );
  function reset(ch: Channel, pu: Purpose, pr = promo) {
    setChannel(ch);
    setPurpose(pu);
    setText(compose(ch, pu, pu === "offre" ? pr : undefined));
    setError("");
  }
  const recipient = channel === "email" ? contacts.email : contacts.phone;
  const live = data.messaging?.[channel];
  const footer = commercial(purpose) ? `\n\n${optOut(channel)}` : "";
  const smsLength = text.body.length + footer.length;

  return (
    <form
      className="form message-composer"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await send({
            action: "messageCustomer",
            id: customer.id,
            channel,
            purpose,
            subject: channel === "email" ? text.subject : undefined,
            body: text.body,
          });
          const what = channel === "email" ? "Email" : "SMS";
          if (r?.status === "error")
            setError(`Le fournisseur a refusé l’envoi : ${r.error}`);
          else
            done(
              r?.status === "sent"
                ? `${what} envoyé à ${customer.name} (${recipient}).`
                : `${what} enregistré en mode démo pour ${customer.name} : aucun fournisseur n’est branché, rien n’est parti.`,
            );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="tabs" role="tablist" aria-label="Canal">
        {(["email", "sms"] as const).map((ch) => {
          const to = ch === "email" ? contacts.email : contacts.phone;
          return (
            <button
              key={ch}
              type="button"
              role="tab"
              aria-selected={channel === ch}
              className={channel === ch ? "active" : ""}
              disabled={!to}
              title={to ? undefined : "Aucun contact de ce type sur la fiche"}
              onClick={() => reset(ch, purpose)}
            >
              {ch === "email" ? (
                <Mail size={14} />
              ) : (
                <MessageSquare size={14} />
              )}{" "}
              {ch === "email" ? "Email" : "SMS"} · {to ?? "indisponible"}
            </button>
          );
        })}
      </div>
      <div className="purpose-picker" role="radiogroup" aria-label="Intention">
        {purposes.map((p) => {
          const blocked = commercial(p.id) && !contacts.consent;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={purpose === p.id}
              className={purpose === p.id ? "active" : ""}
              disabled={blocked}
              title={blocked ? "Accord du client requis" : p.hint}
              onClick={() => reset(channel, p.id)}
            >
              <b>{p.label}</b>
              <small>{blocked ? "Accord requis" : p.hint}</small>
            </button>
          );
        })}
      </div>
      {purpose === "offre" && offers.length > 0 && (
        <label>
          Code à partager
          <select
            value={promoId}
            onChange={(e) => {
              setPromoId(e.target.value);
              reset(
                channel,
                "offre",
                offers.find((p) => p.id === e.target.value),
              );
            }}
          >
            <option value="">Sans code</option>
            {offers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} ·{" "}
                {p.kind === "percent" ? `${p.value} %` : money(p.value)}
              </option>
            ))}
          </select>
        </label>
      )}
      {purpose === "offre" && !offers.length && (
        <p className="muted">
          Aucun code actif pour ce client : créez-en un avec « Offrir un code »
          pour l’inclure au message.
        </p>
      )}
      {channel === "email" && (
        <label>
          Objet
          <input
            value={text.subject}
            maxLength={150}
            required
            onChange={(e) => setText({ ...text, subject: e.target.value })}
          />
        </label>
      )}
      <label>
        Message
        <textarea
          value={text.body}
          rows={channel === "email" ? 9 : 4}
          maxLength={channel === "sms" ? 560 : 4800}
          required
          onChange={(e) => setText({ ...text, body: e.target.value })}
        />
      </label>
      <p className="muted message-meta">
        {footer && <>Mention ajoutée : « {optOut(channel)} » · </>}
        {channel === "sms" &&
          `${smsLength} caractères · ${Math.max(1, Math.ceil(smsLength / 153))} SMS · `}
        {live
          ? "Envoi réel"
          : "Mode démo : l’envoi est tracé, aucun message ne part"}
      </p>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <Button disabled={busy || !recipient}>
        {busy
          ? "Envoi…"
          : `Envoyer ${channel === "email" ? "l’email" : "le SMS"}`}
      </Button>
    </form>
  );
}
