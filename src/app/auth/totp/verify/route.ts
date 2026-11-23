import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/infrastructure/auth/oidc";
import { authenticated } from "@/features/platform/http";
import { verifyTotp } from "@/infrastructure/auth/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin()) return reply({ error: "Origine non autorisée." }, 403);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Requête invalide." }, 400);
  }
  const code = String(body.code ?? "");
  try {
    const result = await authenticated(undefined, async (tx, user) => {
      const r = await tx.query<{ totp_secret: string | null }>(
        "SELECT totp_secret FROM profile_two_factor WHERE profile_id=$1",
        [user.id],
      );
      const secret = r.rows[0]?.totp_secret;
      if (!secret) return { ok: false, error: "Aucun secret en attente. Recommencez l’enrôlement." };
      if (!verifyTotp(secret, code)) return { ok: false, error: "Code invalide. Réessayez." };
      await tx.query(
        "UPDATE profile_two_factor SET totp_enabled=true, updated_at=now() WHERE profile_id=$1",
        [user.id],
      );
      return { ok: true };
    });
    if (!result.ok) return reply({ error: result.error }, result.error?.includes("Code invalide") ? 401 : 400);
    return reply({ ok: true });
  } catch (error) {
    console.error("[totp] Vérification impossible", error instanceof Error ? error.message : "UnknownError");
    return reply({ error: "Connexion requise." }, 401);
  }
}