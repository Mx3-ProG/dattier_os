import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest } from "next/server";
import {
  authenticated,
  assertOrigin,
  readBody,
  json,
  failure,
  rateLimit,
} from "@/features/platform/http";
import { overview, platformPerform } from "@/features/platform/service";
import { referralCookie } from "@/features/platform/pricing";
async function routeGET() {
  try {
    return json(await authenticated(undefined, overview));
  } catch (e) {
    return failure(e);
  }
}
async function routePOST(req: NextRequest) {
  try {
    await assertOrigin(req);
    const body = await readBody(req);
    const referral = req.cookies.get(referralCookie)?.value;
    if (body.action === "onboard" && referral) body.referral = referral;
    const restaurant =
      typeof body.restaurant === "string" && body.action !== "onboard"
        ? body.restaurant
        : undefined;
    return json(
      await authenticated(restaurant, async (tx, user) => {
        await rateLimit(tx, `platform:${user.id}`, 30);
        return platformPerform(tx, user, body);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext("/api/platform", routeGET);

export const POST = withRequestContext("/api/platform", routePOST);
