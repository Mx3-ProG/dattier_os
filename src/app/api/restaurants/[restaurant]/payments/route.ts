import { NextRequest } from "next/server";
import { actor } from "@/lib/auth/session";
import { withDatabaseContext } from "@/lib/database/context";
import { getDb } from "@/lib/database/db";
import { withRequestContext } from "@/features/ops-security/context";
import {
  assertOrigin,
  failure,
  json,
  readBody,
} from "@/features/platform/http";
import {
  paymentAction,
  paymentActionSchema,
  paymentsState,
  type Run,
} from "@/features/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string }> };

/** Plusieurs transactions courtes : un appel à Stripe ne garde aucune connexion ouverte. */
async function session(restaurant: string) {
  const user = await actor();
  const db = await getDb();
  const run: Run = (fn) =>
    withDatabaseContext({ userId: user.id, restaurantId: restaurant }, () =>
      db.transaction(fn),
    );
  return { user, run };
}

async function routeGET(_req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    const { user, run } = await session(restaurant);
    return json(await paymentsState(run, restaurant, user));
  } catch (e) {
    return failure(e);
  }
}

async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const action = paymentActionSchema.parse(await readBody(req));
    const { user, run } = await session(restaurant);
    return json(await paymentAction(run, restaurant, user, action));
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/payments",
  routeGET,
);
export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/payments",
  routePOST,
);
