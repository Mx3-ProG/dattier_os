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
  ask,
  askSchema,
  assistantState,
  packSchema,
  requestPack,
} from "@/features/assistant/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(_req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(
      await authenticated(restaurant, (db) => assistantState(db, restaurant)),
    );
  } catch (e) {
    return failure(e);
  }
}

async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const body = await readBody(req, 60000);
    if (body?.kind === "pack") {
      const { pack } = packSchema.parse(body);
      return json(
        await authenticated(restaurant, (db) =>
          requestPack(db, restaurant, pack),
        ),
      );
    }
    return json(await ask(restaurant, askSchema.parse(body)));
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/assistant",
  routeGET,
);
export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/assistant",
  routePOST,
);
