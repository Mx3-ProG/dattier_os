"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function SubscriptionForm({ plan }: { plan: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "onboard",
          plan,
          organization: form.get("organization"),
          restaurant: form.get("restaurant"),
        }),
      });
      if (response.status === 401) {
        router.replace(`/connexion?returnTo=${encodeURIComponent(location.pathname)}`);
        return;
      }
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message || "La demande n’a pas pu être envoyée.");
      }
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Service indisponible.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return (
    <div role="status">
      <p>Votre demande a été enregistrée. Retrouvez son statut dans votre espace client.</p>
      <Link className="access-primary" href="/platform">Ouvrir mon espace</Link>
    </div>
  );

  return (
    <form className="access-form" onSubmit={submit}>
      <label>Nom de l’organisation<input name="organization" required minLength={2} maxLength={150} /></label>
      <label>Nom du premier restaurant<input name="restaurant" required minLength={2} maxLength={150} /></label>
      {error && <p role="alert">{error}</p>}
      <button className="access-primary" disabled={busy}>
        {busy ? "Envoi en cours…" : "Demander l’activation"}
      </button>
    </form>
  );
}
