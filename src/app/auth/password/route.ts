import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/infrastructure/auth/oidc";
import { supabaseIssuer, supabaseConfigured, supabasePublishableKey } from "@/infrastructure/auth/supabase";
import { passwordProblem } from "@/infrastructure/auth/password-policy";
import { breachedPasswordProblem } from "@/infrastructure/auth/breached-password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

/**
 * New password after a recovery link: same rules as sign-up (strength,
 * confirmation, leaked passwords), then Supabase stores it as a bcrypt hash.
 * The password only transits here; it is never logged nor written anywhere.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin()) return reply({ error: "Origine non autorisée." }, 403);
  if (!supabaseConfigured()) return reply({ error: "Service de connexion indisponible." }, 503);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return reply({ error: "Requête trop volumineuse." }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Requête invalide." }, 400);
  }
  const token = typeof body.accessToken === "string" ? body.accessToken : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  if (!/^[A-Za-z0-9._-]{20,4096}$/.test(token)) return reply({ error: "Lien expiré. Demandez un nouveau lien." }, 401);
  const headers = { apikey: supabasePublishableKey(), Authorization: `Bearer ${token}` };
  try {
    const me = await fetch(`${supabaseIssuer()}/user`, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!me.ok) return reply({ error: "Lien expiré. Demandez un nouveau lien." }, 401);
    const { email = "" } = (await me.json()) as { email?: string };
    const weak = passwordProblem(password, email);
    if (weak) return reply({ error: weak }, 400);
    if (password !== confirm) return reply({ error: "Les deux mots de passe ne correspondent pas." }, 400);
    const breached = await breachedPasswordProblem(password);
    if (breached) return reply({ error: breached }, 400);
    const response = await fetch(`${supabaseIssuer()}/user`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return reply({ ok: true });
    const data = (await response.json().catch(() => ({}))) as { error_code?: string; code?: string };
    const code = String(data.error_code || data.code || "");
    if (code === "same_password") return reply({ error: "Choisissez un mot de passe différent de l’ancien." }, 400);
    if (code === "weak_password") return reply({ error: "Mot de passe refusé : trop faible ou déjà compromis." }, 400);
    if (response.status === 401 || response.status === 403) return reply({ error: "Lien expiré. Demandez un nouveau lien." }, 401);
    console.error("[auth] Changement de mot de passe refusé par Supabase", response.status, code);
    return reply({ error: "Changement impossible pour le moment. Réessayez." }, 503);
  } catch (error) {
    console.error("[auth] Changement de mot de passe impossible", error instanceof Error ? error.message : "UnknownError");
    return reply({ error: "Changement impossible pour le moment. Réessayez." }, 503);
  }
}
