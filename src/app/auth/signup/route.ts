import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appOrigin, safeReturnTo } from "@/infrastructure/auth/oidc";
import { supabaseIssuer, supabaseConfigured, supabasePublishableKey } from "@/infrastructure/auth/supabase";
import { checkSignupEmail } from "@/infrastructure/auth/disposable-email";
import { passwordProblem } from "@/infrastructure/auth/password-policy";
import { breachedPasswordProblem } from "@/infrastructure/auth/breached-password";
import { getDb } from "@/infrastructure/database/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

async function tooManyAttempts(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const key = "signup:" + createHash("sha256").update(ip).digest("hex").slice(0, 32);
  try {
    const result = await (await getDb()).query<{ allowed: boolean }>(
      "SELECT app.consume_rate_limit($1,$2,60) AS allowed",
      [key, 5],
    );
    return !result.rows[0]?.allowed;
  } catch {
    return false; // Supabase keeps its own limits if our counter is unavailable.
  }
}

/**
 * Account creation, validated on the server before Supabase Auth is called:
 * strong password, matching confirmation, no disposable e-mail. Supabase then
 * sends the confirmation e-mail; no session exists until the link is opened.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin()) return reply({ error: "Origine non autorisée." }, 403);
  if (!supabaseConfigured()) return reply({ error: "Les inscriptions sont momentanément fermées." }, 503);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4_000) return reply({ error: "Requête trop volumineuse." }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Requête invalide." }, 400);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  if (name.length < 2 || name.length > 100) return reply({ error: "Indiquez votre nom et prénom." }, 400);

  const verdict = await checkSignupEmail(typeof body.email === "string" ? body.email : "");
  if (!verdict.ok) return reply({ error: verdict.reason, field: "email" }, 400);
  const weak = passwordProblem(password, verdict.email);
  if (weak) return reply({ error: weak, field: "password" }, 400);
  if (password !== confirm) return reply({ error: "Les deux mots de passe ne correspondent pas.", field: "confirm" }, 400);
  const breached = await breachedPasswordProblem(password);
  if (breached) return reply({ error: breached, field: "password" }, 400);
  if (await tooManyAttempts(req)) return reply({ error: "Trop de tentatives. Patientez une minute puis réessayez." }, 429);

  const returnTo = safeReturnTo(typeof body.returnTo === "string" ? body.returnTo : undefined);
  const redirectTo = `${appOrigin()}/connexion/confirmation?${new URLSearchParams({ returnTo })}`;
  try {
    const response = await fetch(`${supabaseIssuer()}/signup?${new URLSearchParams({ redirect_to: redirectTo })}`, {
      method: "POST",
      headers: { apikey: supabasePublishableKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: verdict.email, password, data: { name } }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      identities?: unknown[];
      user?: { identities?: unknown[] };
      error_code?: string;
      code?: string | number;
      msg?: string;
    };
    if (!response.ok) {
      const code = String(data.error_code || data.code || "");
      if (code === "weak_password") return reply({ error: passwordProblem(password, verdict.email) || "Mot de passe trop faible.", field: "password" }, 400);
      if (code === "user_already_exists") return reply({ status: "exists" });
      if (code === "signup_disabled") return reply({ error: "Les inscriptions sont momentanément fermées." }, 503);
      if (response.status === 429 || /rate_limit/.test(code))
        return reply({ error: "Trop de tentatives. Patientez quelques minutes puis réessayez." }, 429);
      if (code === "email_address_invalid") return reply({ error: "Adresse e-mail invalide.", field: "email" }, 400);
      console.error("[auth] Inscription refusée par Supabase", response.status, code);
      return reply({ error: "Inscription impossible pour le moment. Réessayez." }, 503);
    }
    // Supabase answers an existing address with an empty identity list (no enumeration leak on its side).
    const identities = data.user?.identities ?? data.identities;
    if (Array.isArray(identities) && identities.length === 0) return reply({ status: "exists" });
    // A token here means "Confirm email" is off in Supabase: refuse to rely on it.
    if (data.access_token) console.error("[auth] Confirmation e-mail désactivée dans Supabase : activez « Confirm email ».");
    return reply({ status: "confirm", email: verdict.email });
  } catch (error) {
    console.error("[auth] Inscription impossible", error instanceof Error ? error.message : "UnknownError");
    return reply({ error: "Inscription impossible pour le moment. Réessayez." }, 503);
  }
}
