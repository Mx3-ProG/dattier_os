import { NextRequest, NextResponse } from "next/server";
import { referralCookie } from "@/features/platform/pricing";

/** Referral link: remembers the code for 30 days, then shows the offers. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const response = NextResponse.redirect(new URL("/#offres", req.url), 303);
  if (/^[A-Fa-f0-9]{10}$/.test(code))
    response.cookies.set(referralCookie, code.toUpperCase(), {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  return response;
}
