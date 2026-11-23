"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";

export function TwoFactorAuth({ returnTo = "/platform" }: { returnTo?: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), returnTo }),
      });
      const data = (await response.json().catch(() => ({}))) as { returnTo?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Vérification impossible pour le moment.");
      window.location.assign(data.returnTo || returnTo || "/platform");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <span className="access-label">Sécurité</span>
      <h1>Double authentification</h1>
      <p>
        Saisissez le code à six chiffres reçu par e-mail pour confirmer votre connexion.
      </p>
      <form className="access-form" onSubmit={submit} noValidate>
        <label>
          Code à six chiffres
          <input
            name="code"
            aria-label="Code à six chiffres"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            pattern="\d{6}"
            required
          />
        </label>
        {error && <p role="alert" className="access-error">{error}</p>}
        {info && <p role="status">{info}</p>}
        <button className="access-primary" disabled={busy || code.trim().length !== 6}>
          {busy ? "Vérification…" : "Valider le code"}
        </button>
      </form>
      <p>
        <Link className="access-link" href={`/connexion?${new URLSearchParams({ returnTo })}`}>
          Retour à la connexion
        </Link>
      </p>
    </>
  );
}
