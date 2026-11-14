import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import {
  assertOrigin,
  authenticated,
  failure,
  json,
  rateLimit,
  readBody,
} from "@/features/platform/http";
import { scope } from "@/lib/auth/session";
import { setOwnPin, setPinSchema, staffState } from "@/features/team/pins";
import { activityQuery, staffActivity } from "@/features/team/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string }> };

/** État du PIN de la personne connectée, ou historique « qui fait quoi » avec ?activity=1. */
async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    const params = req.nextUrl.searchParams;
    return json(
      await authenticated(restaurant, async (db, user) => {
        const scoped = await scope(db, user, restaurant);
        if (params.get("activity"))
          return staffActivity(
            db,
            restaurant,
            scoped,
            activityQuery.parse(Object.fromEntries(params)),
          );
        return staffState(db, restaurant, scoped);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

/** Création ou changement de son propre code PIN. */
async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const action = setPinSchema.parse(await readBody(req));
    const outcome = await authenticated(restaurant, async (db, user) => {
      await rateLimit(db, `pin:${user.id}`, 10);
      return setOwnPin(db, restaurant, await scope(db, user, restaurant), action);
    });
    if (outcome.error) throw new Error(outcome.error);
    return json({ hasPin: true });
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext("/api/restaurants/[restaurant]/staff", routeGET);
export const POST = withRequestContext("/api/restaurants/[restaurant]/staff", routePOST);
