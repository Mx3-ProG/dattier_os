"use client";
import { useCallback, useEffect, useState } from "react";
import { dateTime, money } from "@/domain/shared/units";
import { Button } from "./ui/button";

type State = {
  enabled: boolean;
  live: boolean;
  status: "none" | "pending" | "active" | "restricted";
  rates: { commissionBp: number; stripeFeeBp: number; holdDays: number };
  nextPayout: string;
  totals: {
    available: number;
    held: number;
    checking: number;
    released: number;
  };
  payments: {
    id: string;
    number: number;
    gross: number;
    commission: number;
    stripe_fee_estimate: number;
    net: number;
    status: string;
    risk_status: string;
    paid_at: string | null;
    available_at: string | null;
  }[];
  payouts: {
    id: string;
    amount: number;
    gross: number;
    status: string;
    reason: string;
    created_at: string;
  }[];
};
const percent = (bp: number) => `${(bp / 100).toLocaleString("fr-FR")} %`;
const accountLabels = {
  none: "À activer",
  pending: "Vérification en cours",
  active: "Actif",
  restricted: "Informations à compléter",
};
function paymentLabel(p: State["payments"][number]) {
  if (p.status === "refunded") return "Remboursé";
  if (p.status === "expired") return "Non payé";
  if (p.status === "released") return "Versé";
  if (p.status === "disputed") return "Litige en cours";
  if (p.status === "manual_review") return "À corriger";
  if (p.risk_status !== "clear") return "Contrôle anti-fraude";
  return "En attente du délai";
}

export function PayoutsCenter({ restaurant }: { restaurant: string }) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/payments`;
  const load = useCallback(async () => {
    const response = await fetch(url);
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error?.message || "Accès impossible.");
    setState(body);
  }, [url]);
  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);
  const run = async (action: Record<string, unknown>, done?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Opération impossible.");
      if (body.url) {
        location.href = body.url;
        return;
      }
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!state)
    return error ? (
      <p className="note" role="alert">
        {error}
      </p>
    ) : (
      <p>Chargement de vos versements…</p>
    );
  const { rates, totals } = state;
  const fees = rates.commissionBp + rates.stripeFeeBp;
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Vos ventes en ligne</h2>
          <p>
            Sur chaque vente, la plateforme retient{" "}
            {percent(rates.commissionBp)} de commission et{" "}
            {percent(rates.stripeFeeBp)} de frais de paiement estimés, soit{" "}
            {percent(fees)}. Le reste vous est versé {rates.holdDays} jours
            après le paiement, une fois les contrôles anti-fraude passés.
          </p>
        </div>
      </div>
      {!state.enabled && (
        <p className="note" role="status">
          Le paiement en ligne n’est pas encore activé sur cette installation.
          Aucun argent ne transite pour le moment.
        </p>
      )}
      {state.enabled && !state.live && (
        <p className="note" role="status">
          Mode test : aucun paiement réel n’est encaissé.
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      <div className="metrics">
        <article className="metric card">
          <span>Disponible</span>
          <strong>{money(totals.available)}</strong>
        </article>
        <article className="metric card">
          <span>En attente du délai</span>
          <strong>{money(totals.held)}</strong>
        </article>
        <article className="metric card">
          <span>En cours de vérification</span>
          <strong>{money(totals.checking)}</strong>
        </article>
        <article className="metric card">
          <span>Déjà versé</span>
          <strong>{money(totals.released)}</strong>
        </article>
      </div>
      <div className="section-heading">
        <div>
          <h2>Compte de versement : {accountLabels[state.status]}</h2>
          {state.status === "active" && (
            <p>
              Prochain versement automatique le{" "}
              {new Date(state.nextPayout).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
              })}
              . Vous pouvez aussi demander tout de suite ce qui est disponible.
            </p>
          )}
          {state.status !== "active" && (
            <p>
              Stripe vérifie l’identité de l’établissement et son IBAN avant
              tout versement.
            </p>
          )}
        </div>
        <div>
          {state.enabled && state.status !== "active" && (
            <Button disabled={busy} onClick={() => run({ action: "onboard" })}>
              {state.status === "none"
                ? "Activer les versements"
                : "Compléter mon dossier"}
            </Button>
          )}
          {state.enabled && state.status === "active" && (
            <>
              <Button
                disabled={busy || totals.available <= 0}
                onClick={() =>
                  run(
                    { action: "request" },
                    "Demande enregistrée : le virement est en préparation.",
                  )
                }
              >
                Demander mon versement
              </Button>{" "}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run({ action: "dashboard" })}
              >
                Mon espace Stripe
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="note">
        La TVA de vos ventes reste à déclarer par vos soins. Son calcul figure
        dans « Opérations à vérifier ».
      </p>

      <div className="section-heading">
        <h2>Ventes en ligne</h2>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Commande</th>
              <th>Payée le</th>
              <th>Montant</th>
              <th>Retenues</th>
              <th>Pour vous</th>
              <th>Versable le</th>
              <th>État</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.payments.map((p) => (
              <tr key={p.id}>
                <td>n° {p.number}</td>
                <td>{p.paid_at ? dateTime(p.paid_at) : "—"}</td>
                <td>{money(p.gross)}</td>
                <td>{money(p.commission + p.stripe_fee_estimate)}</td>
                <td>{money(p.net)}</td>
                <td>{p.available_at ? dateTime(p.available_at) : "—"}</td>
                <td>{paymentLabel(p)}</td>
                <td>
                  {["paid", "released", "manual_review"].includes(p.status) && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Rembourser intégralement ${money(p.gross)} au client ?`,
                          )
                        )
                          void run(
                            { action: "refund", id: p.id },
                            "Remboursement demandé.",
                          );
                      }}
                    >
                      Rembourser
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.payments.length && (
          <p className="empty">Aucune vente en ligne pour le moment.</p>
        )}
      </div>

      <div className="section-heading">
        <h2>Historique des versements</h2>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Origine</th>
              <th>Ventes</th>
              <th>Versé</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {state.payouts.map((p) => (
              <tr key={p.id}>
                <td>{dateTime(p.created_at)}</td>
                <td>
                  {p.reason === "request" ? "Votre demande" : "Automatique"}
                </td>
                <td>{money(p.gross)}</td>
                <td>{money(p.amount)}</td>
                <td>
                  {p.status === "sent"
                    ? "Envoyé"
                    : p.status === "cancelled"
                      ? "Annulé"
                      : "En préparation"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.payouts.length && (
          <p className="empty">Aucun versement pour le moment.</p>
        )}
      </div>
    </>
  );
}
