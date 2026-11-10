"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { callAuth, openSession, type SupabasePublic } from "./password-auth";

type State =
  | { step: "working" }
  | { step: "recovery"; token: string }
  | { step: "failed"; message: string };

/**
 * Landing page of the links Supabase e-mails (sign-up confirmation, password
 * recovery). Handles the default link format (tokens in the URL fragment) and
 * custom templates passing `token_hash`, so it works from any device.
 */
export function AuthConfirmation({ config, returnTo }: { config: SupabasePublic; returnTo: string }) {
  const [state, setState] = useState<State>({ step: "working" });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    // Remove tokens from the address bar and history straight away.
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    void (async () => {
      try {
        const failure = hash.get("error_description") || query.get("error_description");
        if (failure) {
          const expired = /expired|invalid/i.test(failure) || hash.get("error_code") === "otp_expired";
          throw new Error(expired
            ? "Ce lien a expiré ou a déjà été utilisé. Connectez-vous, ou demandez un nouveau lien."
            : "Le lien n’a pas pu être validé. Demandez un nouveau lien.");
        }
        let token = hash.get("access_token");
        let type = hash.get("type") || query.get("type");
        const tokenHash = query.get("token_hash");
        if (!token && tokenHash) {
          const verifyType = type === "recovery" ? "recovery" : type === "email_change" ? "email_change" : "email";
          const data = await callAuth(config, "verify", { type: verifyType, token_hash: tokenHash });
          token = data.access_token ?? null;
          type = verifyType;
        }
        if (!token) throw new Error("Adresse confirmée. Vous pouvez maintenant vous connecter.");
        if (type === "recovery") { setState({ step: "recovery", token }); return; }
        await openSession(token, returnTo);
      } catch (e) {
        setState({ step: "failed", message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [config, returnTo]);

  async function choosePassword(event: FormEvent) {
    event.preventDefault();
    if (state.step !== "recovery" || busy) return;
    if (password.length < 8) { setError("Mot de passe trop faible : 8 caractères minimum."); return; }
    setBusy(true); setError("");
    try {
      await callAuth(config, "user", { password }, { method: "PUT", token: state.token });
      await openSession(state.token, returnTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const login = `/connexion?${new URLSearchParams({ returnTo })}`;
  if (state.step === "recovery")
    return (
      <>
        <span className="access-label">Espace client</span>
        <h1>Nouveau mot de passe</h1>
        <form className="access-form" onSubmit={choosePassword}>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          {error && <p role="alert" className="access-error">{error}</p>}
          <button className="access-primary" disabled={busy}>{busy ? "Un instant…" : "Enregistrer et me connecter"}</button>
        </form>
      </>
    );
  if (state.step === "failed")
    return (
      <>
        <span className="access-label">Espace client</span>
        <h1>{/confirmée/.test(state.message) ? "C’est confirmé." : "Lien non valide"}</h1>
        <p role="status">{state.message}</p>
        <Link className="access-primary" href={login}>Se connecter</Link>
      </>
    );
  return (
    <>
      <span className="access-label">Espace client</span>
      <h1>Connexion en cours…</h1>
      <p role="status">Nous vérifions votre lien.</p>
    </>
  );
}
