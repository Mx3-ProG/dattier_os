"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";

export type SupabasePublic = { url: string; key: string };
type Mode = "login" | "register" | "forgot";

type AuthResponse = {
  access_token?: string;
  user?: { identities?: unknown[] };
  identities?: unknown[];
  error?: string;
  error_code?: string;
  code?: string | number;
  msg?: string;
  message?: string;
  error_description?: string;
};

/** French message for Supabase Auth error payloads. */
export function authError(data: AuthResponse, status: number) {
  const code = String(data.error_code || data.code || data.error || "");
  const text = String(data.msg || data.message || data.error_description || "");
  if (code === "email_not_confirmed" || /not confirmed/i.test(text))
    return "Adresse e-mail non confirmée. Ouvrez le lien reçu par e-mail, ou renvoyez-le.";
  if (code === "invalid_credentials" || code === "invalid_grant" || /invalid login/i.test(text))
    return "E-mail ou mot de passe incorrect.";
  if (code === "user_already_exists" || /already registered/i.test(text))
    return "Un compte existe déjà avec cette adresse. Connectez-vous.";
  if (code === "weak_password" || /password should/i.test(text))
    return "Mot de passe trop faible : 8 caractères minimum, avec lettres et chiffres.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429)
    return "Trop de tentatives. Patientez quelques minutes puis réessayez.";
  if (code === "signup_disabled") return "Les inscriptions sont momentanément fermées.";
  if (code === "email_address_invalid" || /invalid.*email/i.test(text))
    return "Adresse e-mail invalide.";
  if (code === "same_password") return "Choisissez un mot de passe différent de l’ancien.";
  return "Service de connexion momentanément indisponible. Réessayez.";
}

export async function callAuth(
  config: SupabasePublic,
  path: string,
  body: unknown,
  init: { method?: string; token?: string } = {},
) {
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: init.method || "POST",
    headers: {
      apikey: config.key,
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) throw new Error(authError(data, response.status));
  return data;
}

/** Hands the Supabase access token to the server, which opens the app session. */
export async function openSession(accessToken: string, returnTo: string) {
  const response = await fetch("/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, returnTo }),
  });
  const data = (await response.json().catch(() => ({}))) as { returnTo?: string; error?: string };
  if (!response.ok) throw new Error(data.error || "Connexion impossible pour le moment.");
  window.location.assign(data.returnTo || "/platform");
}

export function PasswordAuth({
  config,
  returnTo,
  initialMode,
  notice,
}: {
  config: SupabasePublic;
  returnTo: string;
  initialMode: Mode;
  notice?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(notice || "");
  const [unconfirmed, setUnconfirmed] = useState(false);
  // Computed on demand: window does not exist while the page renders on the server.
  const confirmationUrl = () => `${window.location.origin}/connexion/confirmation?${new URLSearchParams({ returnTo })}`;

  async function resend() {
    setBusy(true); setError("");
    try {
      await callAuth(config, `resend?${new URLSearchParams({ redirect_to: confirmationUrl() })}`, {
        type: "signup",
        email: email.trim(),
      });
      setInfo("Nouvel e-mail de confirmation envoyé. Pensez à vérifier vos indésirables.");
      setUnconfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setInfo(""); setUnconfirmed(false);
    const cleanEmail = email.trim().toLowerCase();
    try {
      if (mode === "login") {
        const data = await callAuth(config, "token?grant_type=password", {
          email: cleanEmail,
          password,
        });
        if (!data.access_token) throw new Error("Connexion refusée.");
        await openSession(data.access_token, returnTo);
        return;
      }
      if (mode === "register") {
        if (password.length < 8)
          throw new Error("Mot de passe trop faible : 8 caractères minimum.");
        const data = await callAuth(
          config,
          `signup?${new URLSearchParams({ redirect_to: confirmationUrl() })}`,
          { email: cleanEmail, password, data: { name: name.trim() } },
        );
        // E-mail confirmation disabled in Supabase: the session is immediate.
        if (data.access_token) {
          await openSession(data.access_token, returnTo);
          return;
        }
        const identities = data.user?.identities ?? data.identities;
        if (Array.isArray(identities) && identities.length === 0) {
          setMode("login");
          setError("Un compte existe déjà avec cette adresse. Connectez-vous.");
          return;
        }
        setInfo(`Compte créé. Ouvrez le lien envoyé à ${cleanEmail} pour confirmer votre adresse, puis vous serez connecté automatiquement.`);
        setPassword("");
        return;
      }
      await callAuth(
        config,
        `recover?${new URLSearchParams({ redirect_to: confirmationUrl() })}`,
        { email: cleanEmail },
      );
      setInfo(`Si un compte existe pour ${cleanEmail}, un lien de réinitialisation vient d’être envoyé.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setUnconfirmed(/non confirmée/.test(message));
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (next: Mode) => { setMode(next); setError(""); setInfo(""); setUnconfirmed(false); };
  return (
    <>
      <span className="access-label">Espace client</span>
      <h1>
        {mode === "register" ? "Créer votre compte" : mode === "forgot" ? "Mot de passe oublié" : "Heureux de vous revoir."}
      </h1>
      <p>
        {mode === "register"
          ? "Inscrivez-vous avec votre adresse e-mail pour ouvrir votre espace."
          : mode === "forgot"
            ? "Recevez un lien pour choisir un nouveau mot de passe."
            : "Connectez-vous pour retrouver votre espace STUDIO OS."}
      </p>
      <form className="access-form" onSubmit={submit} noValidate>
        {mode === "register" && (
          <label>
            Nom et prénom
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={100} />
          </label>
        )}
        <label>
          Adresse e-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={150} />
        </label>
        {mode !== "forgot" && (
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
              minLength={mode === "register" ? 8 : 1}
            />
          </label>
        )}
        {error && <p role="alert" className="access-error">{error}</p>}
        {info && <p role="status">{info}</p>}
        <button className="access-primary" disabled={busy}>
          {busy
            ? "Un instant…"
            : mode === "register"
              ? "Créer mon compte"
              : mode === "forgot"
                ? "Envoyer le lien"
                : "Se connecter"}
        </button>
      </form>
      {unconfirmed && (
        <p><button type="button" className="access-link" onClick={() => void resend()} disabled={busy}>Renvoyer l’e-mail de confirmation</button></p>
      )}
      {mode === "login" && (
        <p><button type="button" className="access-link" onClick={() => switchTo("forgot")}>Mot de passe oublié ?</button></p>
      )}
      <p>
        {mode === "register" ? "Déjà un compte ?" : mode === "forgot" ? "Vous vous en souvenez ?" : "Première visite ?"}{" "}
        <button type="button" className="access-link" onClick={() => switchTo(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Créer un compte" : "Se connecter"}
        </button>
      </p>
      {mode === "register" && (
        <p className="access-fine">
          En créant un compte, vous acceptez les <Link href="/cgu">conditions d’utilisation</Link> et la{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      )}
    </>
  );
}
