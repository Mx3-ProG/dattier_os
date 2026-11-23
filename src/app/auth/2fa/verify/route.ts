import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { appOrigin, establishIdentity, safeReturnTo } from "@/infrastructure/auth/oidc";
import { supabaseIssuer, supabaseConfigured, supabasePublishableKey, supabaseUser } from "@/infrastructure/auth/supabase";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieName = "atacuisine_2fa";

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET requis.");
  return new TextEncoder().encode(s);
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin()) return reply({ error: "Origine non autorisée." }, 403);
  if (!supabaseConfigured()) return reply({ error: "Double authentification indisponible." }, 503);
  const jar = await cookies();
  const flow = jar.get(cookieName)?.value;
  if (!flow) return reply({ error: "Session de vérification expirée. Reconnectez-vous." }, 401);
  let payload: { email?: string; returnTo?: string; exp?: number };
  try {
    const v = await jwtVerify(flow, secret(), { issuer: "atacuisine-2fa", audience: "atacuisine-web", algorithms: ["HS256"] });
    payload = v.payload as typeof payload;
  } catch {
    return reply({ error: "Session de vérification expirée. Reconnectez-vous." }, 401);
  }
  if (!payload.email || (payload.exp && payload.exp < Date.now())) return reply({ error: "Session de vérification expirée. Reconnectez-vous." }, 401);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return reply({ error: "Requête trop volumineuse." }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Requête invalide." }, 400);
  }
  const code = String(body.code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return reply({ error: "Le code doit contenir six chiffres." }, 400);
  const returnTo = safeReturnTo(typeof body.returnTo === "string" ? body.returnTo : payload.returnTo);

  try {
    const response = await fetch(`${supabaseIssuer()}/verify`, {
      method: "POST",
      headers: { apikey: supabasePublishableKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", token: code, email: payload.email }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json().catch(() => ({}))) as { access_token?: string; error_code?: string; code?: string | number; msg?: string; message?: string };
    if (!response.ok || !data.access_token) {
      const text = String(data.msg || data.message || "");
      if (/expired|invalid/i.test(text) || response.status === 401 || response.status === 403)
        return reply({ error: "Code invalide ou expiré. Réessayez." }, 401);
      return reply({ error: "Vérification impossible pour le moment. Réessayez." }, 503);
    }
    const user = await supabaseUser(data.access_token);
    await establishIdentity(supabaseIssuer(), user.sub, user.name, user.email);
    jar.delete(cookieName);
    return reply({ returnTo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[2fa] Vérification impossible", message);
    return reply({ error: "Vérification impossible pour le moment. Réessayez." }, 503);
  }
}
