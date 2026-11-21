import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/infrastructure/auth/oidc";
import { authenticated } from "@/features/platform/http";
import { getDb } from "@/infrastructure/database/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin()) return reply({ error: "Origine non autorisée." }, 403);
  try {
    await authenticated(undefined, async (tx, user) => {
      await tx.query(
        "UPDATE profile_two_factor SET totp_enabled=false, totp_secret=NULL, updated_at=now() WHERE profile_id=$1",
        [user.id],
      );
    });
    return reply({ ok: true });
  } catch {
    return reply({ error: "Connexion requise." }, 401);
  }
}