import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import {
  assertOrigin,
  authenticated,
  failure,
  json,
  readBody,
} from "@/features/platform/http";
import {
  billingAction,
  billingActionSchema,
  billingState,
} from "@/features/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(_req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(
      await authenticated(restaurant, (db, user) =>
        billingState(db, restaurant, user),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const action = billingActionSchema.parse(await readBody(req));
    return json(
      await authenticated(restaurant, (db, user) =>
        billingAction(db, restaurant, user, action),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/billing",
  routeGET,
);
export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/billing",
  routePOST,
);
