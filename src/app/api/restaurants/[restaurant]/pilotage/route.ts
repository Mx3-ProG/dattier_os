import { NextRequest } from "next/server";
import {
  authenticated,
  assertOrigin,
  readBody,
  json,
  failure,
  rateLimit,
} from "@/features/platform/http";
import { withRequestContext } from "@/features/ops-security/context";
import { readPilotage, savePilotage } from "@/features/pilotage/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
const path = "/api/restaurants/[restaurant]/pilotage";
export const GET = withRequestContext(
  path,
  async (_req: NextRequest, c: Context) => {
    try {
      const { restaurant } = await c.params;
      return json(
        await authenticated(restaurant, (db, user) =>
          readPilotage(db, user, restaurant),
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
          if (req.headers.get("x-pilotage-account") !== user.id)
            throw new Error("Votre compte a été modifié. Rechargez la page.");
          await rateLimit(db, `pilotage:${user.id}`, 30);
          return savePilotage(db, user, restaurant, body);
        }),
      );
    } catch (error) {
      return failure(error);
    }
  },
);
