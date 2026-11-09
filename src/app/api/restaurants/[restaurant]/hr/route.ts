import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import {
  assertOrigin,
  authenticated,
  failure,
  json,
  readBody,
} from "@/features/platform/http";
import { hrAction, hrActionSchema, hrState } from "@/features/hr/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    const month = req.nextUrl.searchParams.get("month") || undefined;
    return json(
      await authenticated(restaurant, (db, user) =>
        hrState(db, restaurant, user, month),
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
    const action = hrActionSchema.parse(await readBody(req));
    return json(
      await authenticated(restaurant, (db, user) =>
        hrAction(db, restaurant, user, action),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/hr",
  routeGET,
);
export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/hr",
  routePOST,
);
