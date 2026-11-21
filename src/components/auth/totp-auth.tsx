"use client";
import { useState, type FormEvent } from "react";

export function TotpAuth() {
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function enroll() {
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await fetch("/auth/totp/enroll", { method: "POST", headers: { "Content-Type": "application/json" } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Enrôlement impossible.");
      setSecret(d.secret); setUri(d.otpauthUrl);
      setInfo("Scannez ce secret dans votre application d’authentification, puis saisissez le code généré.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await fetch("/auth/totp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Code invalide.");
      setInfo("Authentification renforcée activée.");
      setSecret(""); setUri("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span className="access-label">Sécurité</span>
      <h1>Authentification par application</h1>
      <p>Google Authenticator, Microsoft Authenticator, Authy, et toute application compatible TOTP.</p>
      {!secret && (
        <button className="access-primary" onClick={() => void enroll()} disabled={busy}>
          {busy ? "Un instant…" : "Activer l’authentificateur"}
        </button>
      )}
      {secret && (
        <>
          <p><strong>Secret :</strong> <code>{secret}</code></p>
          <p><strong>Lien :</strong> <code>{uri}</code></p>
          <form className="access-form" onSubmit={verify}>
            <label>Code généré par l’application
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required />
            </label>
            {error && <p role="alert" className="access-error">{error}</p>}
            {info && <p role="status">{info}</p>}
            <button className="access-primary" disabled={busy}>{busy ? "Vérification…" : "Valider"}</button>
          </form>
        </>
      )}
      {error && !secret && <p role="alert" className="access-error">{error}</p>}
      {info && !secret && <p role="status">{info}</p>}
    </>
  );
}
