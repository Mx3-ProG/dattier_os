import { NextResponse } from "next/server";
import { authenticated } from "@/features/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    const result = await authenticated(undefined, async (tx, user) => {
      const r = await tx.query<{ email_otp_enabled: boolean; totp_enabled: boolean }>(
        "SELECT email_otp_enabled, totp_enabled FROM profile_two_factor WHERE profile_id=$1",
        [user.id],
      );
      return {
        emailOtp: r.rows[0]?.email_otp_enabled ?? false,
        totpEnabled: r.rows[0]?.totp_enabled ?? false,
      };
    });
    return reply(result);
  } catch {
    return reply({ error: "Connexion requise." }, 401);
  }
}