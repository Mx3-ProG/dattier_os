"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/shared/types";
import { Modal } from "../forms";
import { Button } from "../ui/button";

/** The reminder opens during the last three days of the free trial. */
const reminderWindow = 72 * 3600 * 1000;
/** Stripe keeps the remaining free days only when the trial ends ≥ 48 h ahead (see plan-billing). */
const keptTrial = 49 * 3600 * 1000;

function dismissKey(organization: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  return `studio-os:trial-reminder:${organization}:${day}`;
}

/** Shown to the owner before the trial ends, to activate the 39 € subscription. */
export function TrialReminder({ trial }: { trial: Snapshot["trial"] }) {
  // null: closed; otherwise whether Stripe still keeps the remaining free days.
  const [open, setOpen] = useState<null | { keepsTrial: boolean }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const organization = trial?.organization;
  const endsAt = trial?.endsAt;
  const eligible = !!trial?.active && !!trial.owner && !trial.subscribed;
  useEffect(() => {
    if (!eligible || !organization || !endsAt) return;
    const left = Date.parse(endsAt) - Date.now();
    if (left > reminderWindow || left <= 0) return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(dismissKey(organization)) === "1";
    } catch {
      /* Without browser storage the reminder simply shows again. */
    }
    // Opening after mount keeps the server and client renders identical.
    const timer = setTimeout(
      () => setOpen(dismissed ? null : { keepsTrial: left > keptTrial }),
      0,
    );
    return () => clearTimeout(timer);
  }, [eligible, organization, endsAt]);
  if (!open || !trial?.endsAt) return null;
  const close = () => {
    try {
      window.localStorage.setItem(dismissKey(trial.organization), "1");
    } catch {
      /* Ignored: see above. */
    }
    setOpen(null);
  };
  async function subscribe() {
    if (!trial) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", organization: trial.organization }),
      });
      const body = await response.json();
      if (!response.ok || !body.url)
        throw new Error(body.error?.message || "Paiement indisponible pour le moment.");
      window.location.assign(body.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Paiement indisponible pour le moment.");
      setBusy(false);
    }
  }
  const end = new Date(trial.endsAt).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
  return (
    <Modal
      title="Votre essai se termine bientôt"
      description={`Votre essai gratuit prend fin le ${end}.`}
      close={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Plus tard
          </Button>
          {trial.billingReady ? (
            <Button onClick={() => void subscribe()} disabled={busy}>
              {busy ? "Ouverture du paiement…" : "Activer mon abonnement"}
            </Button>
          ) : (
            <Link className="button" href="/platform">
              Activer mon abonnement
            </Link>
          )}
        </>
      }
    >
      <p>
        Gardez toutes vos fonctionnalités, vos données et votre équipe sans
        interruption : activez votre abonnement Studio à 39 € TTC par mois,
        sans engagement et résiliable à tout moment.
      </p>
      <p>
        {open.keepsTrial
          ? "Le premier prélèvement n’a lieu qu’à la fin de votre essai."
          : "Le premier mois est prélevé à l’activation."}{" "}
        Sans abonnement, l’accès à l’espace se fermera à la fin de l’essai.
      </p>
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
