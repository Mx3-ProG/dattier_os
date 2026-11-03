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
import { adminState, adminPerform } from "@/features/platform/admin";
type Context = { params: Promise<{ restaurant: string; module: string }> };
async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant, module } = await c.params;
    const raw = Number(req.nextUrl.searchParams.get("after") || 0);
    const after = Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
    return json(
      await authenticated(restaurant, (db, user) =>
        adminState(db, restaurant, user, module, after),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant, module } = await c.params;
    const body = await readBody(req);
    return json(
      await authenticated(restaurant, async (db, user) => {
        await rateLimit(db, `admin:${user.id}`, 120);
        return adminPerform(db, restaurant, user, module, body);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/[module]",
  routeGET,
);

export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/[module]",
  routePOST,
);
