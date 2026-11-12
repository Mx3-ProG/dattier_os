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
import { offlineState, offlinePerform } from "@/features/offline/service";
type Context = { params: Promise<{ restaurant: string }> };
async function routeGET(_: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(
      await authenticated(restaurant, async (db, user) => {
        return offlineState(db, restaurant, user);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const body = await readBody(req);
    return json(
      await authenticated(restaurant, async (db, user) => {
        await rateLimit(db, `offline:${user.id}`, 120);
        return offlinePerform(db, restaurant, user, body);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/offline",
  routeGET,
);

export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/offline",
  routePOST,
);
