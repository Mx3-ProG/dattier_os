import { NextRequest, NextResponse } from "next/server";
import { appOrigin, establishIdentity, safeReturnTo } from "@/infrastructure/auth/oidc";
import { supabaseIssuer, supabaseUser } from "@/infrastructure/auth/supabase";
import { loginEmailCheck } from "@/infrastructure/auth/disposable-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

/** Exchanges a Supabase access token for the app's own signed session cookie. */
export async function POST(req: NextRequest) {
  // Same-origin only: blocks login CSRF into another person's account.
  if (req.headers.get("origin") !== appOrigin())
    return reply({ error: "Origine non autorisée." }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return reply({ error: "Requête trop volumineuse." }, 413);
    const body = JSON.parse(raw) as { accessToken?: unknown; returnTo?: unknown };
    if (typeof body.accessToken !== "string")
      return reply({ error: "Connexion refusée." }, 400);
    const user = await supabaseUser(body.accessToken);
    const verdict = await loginEmailCheck(user.email);
    if (!verdict.ok) return reply({ error: verdict.reason }, 403);
    await establishIdentity(supabaseIssuer(), user.sub, user.name, user.email);
    return reply({
      returnTo: safeReturnTo(typeof body.returnTo === "string" ? body.returnTo : undefined),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = /Confirmez|Connexion refusée|indisponible|non configurée/.test(message);
    if (!known) console.error("[auth] Ouverture de session impossible", message);
    return reply(
      { error: known ? message : "Connexion impossible pour le moment. Réessayez." },
      /Confirmez|refusée/.test(message) ? 401 : 503,
    );
  }
}
