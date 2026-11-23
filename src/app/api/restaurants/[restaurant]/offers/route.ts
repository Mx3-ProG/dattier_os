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
import { offersMutation, offersState } from "@/features/offers/service";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ restaurant: string }> };
const path = "/api/restaurants/[restaurant]/offers";

/** Services et produits de l'établissement (Gestion). */
export const GET = withRequestContext(path, async (_req: NextRequest, c: Context) => {
  try {
    const { restaurant } = await c.params;
    return json(await authenticated(restaurant, (db, user) => offersState(db, user, restaurant)));
  } catch (error) {
    return failure(error);
  }
});

export const POST = withRequestContext(path, async (req: NextRequest, c: Context) => {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const body = await readBody(req, 60_000);
    return json(
      await authenticated(restaurant, async (db, user) => {
        await rateLimit(db, `offers:${user.id}`, 120);
        return offersMutation(db, user, restaurant, body);
      }),
    );
  } catch (error) {
    return failure(error);
  }
});
