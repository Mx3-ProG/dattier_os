import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { appOrigin, establishIdentity, safeReturnTo } from "@/infrastructure/auth/oidc";
import { supabaseIssuer, supabaseConfigured, supabasePublishableKey, supabaseUser } from "@/infrastructure/auth/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieName = "atacuisine_2fa";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET requis.");
  return new TextEncoder().encode(s);
};

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

async function signed(payload: Record<string, unknown>, maxAge: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atacuisine-2fa")
    .setAudience("atacuisine-web")
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin()) return reply({ error: "Origine non autorisée." }, 403);
  if (!supabaseConfigured()) return reply({ error: "Double authentification indisponible." }, 503);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return reply({ error: "Requête trop volumineuse." }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Requête invalide." }, 400);
  }
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  const returnTo = safeReturnTo(typeof body.returnTo === "string" ? body.returnTo : undefined);
  try {
    const user = await supabaseUser(accessToken);
    // Ask Supabase Auth to send the 6-digit code by e-mail.
    const response = await fetch(`${supabaseIssuer()}/otp`, {
      method: "POST",
      headers: { apikey: supabasePublishableKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, create_user: false }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error_code?: string; code?: string | number; msg?: string; message?: string };
      const code = String(data.error_code || data.code || "");
      if (code === "otp_disabled") return reply({ error: "Aucun compte n’est associé à cette adresse." }, 400);
      if (response.status === 429) return reply({ error: "Trop de tentatives. Patientez quelques minutes puis réessayez." }, 429);
      return reply({ error: "Envoi du code impossible pour le moment. Réessayez." }, 503);
    }
    const token = await signed({ email: user.email, returnTo, exp: Date.now() + 10 * 60 * 1000 }, 600);
    const res = reply({ ok: true, email: user.email });
    res.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: appOrigin().startsWith("https:"),
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/Connexion refusée|Confirmez/.test(message)) return reply({ error: message }, 401);
    console.error("[2fa] Démarrage impossible", message);
    return reply({ error: "Double authentification indisponible pour le moment." }, 503);
  }
}
