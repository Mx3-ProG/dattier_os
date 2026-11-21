import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/infrastructure/auth/oidc";
import { authenticated } from "@/features/platform/http";
import { getDb } from "@/infrastructure/database/db";
import { generateTotpSecret, totpKeyUri } from "@/infrastructure/auth/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin()) return reply({ error: "Origine non autorisée." }, 403);
  try {
    const result = await authenticated(undefined, async (tx, user) => {
      const secret = generateTotpSecret();
      await tx.query(
        "INSERT INTO profile_two_factor(profile_id, totp_secret, totp_enabled, updated_at) VALUES($1,$2,false,now()) ON CONFLICT (profile_id) DO UPDATE SET totp_secret=$2, totp_enabled=false, updated_at=now()",
        [user.id, secret],
      );
      return { secret, otpauthUrl: totpKeyUri(secret, user.email || user.id) };
    });
    return reply(result);
  } catch (error) {
    console.error("[totp] Enrôlement impossible", error instanceof Error ? error.message : "UnknownError");
    return reply({ error: "Connexion requise." }, 401);
  }
}