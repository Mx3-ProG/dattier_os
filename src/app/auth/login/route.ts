import { NextRequest, NextResponse } from "next/server";
import { beginLogin } from "@/lib/auth/oidc";
import { demoEnabled } from "@/lib/database/db";

/** Only same-site absolute paths may be used as a post-login destination. */
const safeReturn = (value: string | null) =>
  value && /^\/(?!\/)/.test(value) ? value : "/platform";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

function unavailable(returnTo: string) {
  const retry = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  return new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion indisponible · Dattier OS</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f5ed;color:#2f4034;font:16px/1.5 system-ui,Arial,sans-serif;padding:16px}main{max-width:440px;background:#fff;border:1px solid #e3dece;border-radius:18px;padding:28px}h1{font:600 24px/1.2 Georgia,serif;margin:0 0 10px}p{color:#5b6556;margin:0 0 20px}a{display:inline-block;margin-right:10px;padding:11px 18px;border-radius:999px;background:#344d3e;color:#fff;text-decoration:none;font-weight:600}a+a{background:#eee5d6;color:#2f4034}</style></head><body><main><h1>Connexion momentanément indisponible</h1><p>Le service d’identification ne répond pas. Réessayez dans quelques instants ; si le problème continue, contactez l’administrateur de votre espace.</p><a href="${escape(retry)}">Réessayer</a><a href="/">Accueil</a></main></body></html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "30",
      },
    },
  );
}

export async function GET(req: NextRequest) {
  const returnTo = safeReturn(req.nextUrl.searchParams.get("returnTo"));
  // Local demo: there is no identity provider, profiles are chosen on /demo.
  // Relative Location: stay on the host that was opened (localhost or 127.0.0.1).
  if (demoEnabled())
    return new NextResponse(null, {
      status: 307,
      headers: { Location: `/demo?returnTo=${encodeURIComponent(returnTo)}` },
    });
  try {
    return NextResponse.redirect(await beginLogin(returnTo));
  } catch (error) {
    console.error(
      "[auth] Connexion OIDC impossible :",
      (error as Error).message,
    );
    return unavailable(returnTo);
  }
}
