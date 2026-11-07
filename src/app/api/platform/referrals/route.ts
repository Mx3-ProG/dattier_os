import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import { authenticated, json, failure } from "@/features/platform/http";
import { referralProgram } from "@/features/platform/service";

async function routeGET(req: NextRequest) {
  try {
    const organization = req.nextUrl.searchParams.get("organization") || "";
    if (!organization || organization.length > 150)
      throw new Error("Organisation requise.");
    return json(
      await authenticated(undefined, (tx) => referralProgram(tx, organization)),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext("/api/platform/referrals", routeGET);
