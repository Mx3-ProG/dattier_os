import { NextRequest } from "next/server";
import {
  authenticated,
  assertOrigin,
  failure,
  json,
  rateLimit,
  readBody,
} from "@/features/platform/http";
import { withRequestContext } from "@/features/ops-security/context";
import {
  readModuleSettings,
  requestModuleSetting,
  applyModuleSetting,
} from "@/features/modules/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
const path = "/api/restaurants/[restaurant]/modules";

export const GET = withRequestContext(
  path,
  async (_req: NextRequest, c: Context) => {
    try {
      const { restaurant } = await c.params;
      return json(
        await authenticated(restaurant, (db, user) =>
          readModuleSettings(db, user, restaurant),
        ),
      );
    } catch (error) {
      return failure(error);
    }
  },
);

export const PUT = withRequestContext(
  path,
  async (req: NextRequest, c: Context) => {
    try {
      await assertOrigin(req);
      const { restaurant } = await c.params;
      const body = await readBody(req, 2048);
      return json(
        await authenticated(restaurant, async (db, user) => {
          if (req.headers.get("x-module-account") !== user.id)
            throw new Error("Votre compte a été modifié. Rechargez la page.");
          await rateLimit(db, `modules:${user.id}`, 30);
          return requestModuleSetting(db, user, restaurant, body);
        }),
      );
    } catch (error) {
      return failure(error);
    }
  },
);

export const POST = withRequestContext(
  path,
  async (req: NextRequest, c: Context) => {
    try {
      await assertOrigin(req);
      const { restaurant } = await c.params;
      const body = await readBody(req, 2048);
      return json(
        await authenticated(restaurant, async (db, user) => {
          if (req.headers.get("x-module-account") !== user.id)
            throw new Error("Votre compte a été modifié. Rechargez la page.");
          await rateLimit(db, `modules:${user.id}`, 30);
          return applyModuleSetting(db, user, restaurant, body);
        }),
      );
    } catch (error) {
      return failure(error);
    }
  },
);
