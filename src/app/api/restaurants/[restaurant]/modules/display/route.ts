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
import { setModuleDisplay } from "@/features/modules/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };

/** Afficher ou masquer un add-on dans le tableau de bord. Les droits sont vérifiés en SQL. */
export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/modules/display",
  async (req: NextRequest, c: Context) => {
    try {
      await assertOrigin(req);
      const { restaurant } = await c.params;
      const body = await readBody(req, 1024);
      return json(
        await authenticated(restaurant, async (db, user) => {
          await rateLimit(db, `module-display:${user.id}`, 60);
          return setModuleDisplay(db, user, restaurant, body);
        }),
      );
    } catch (error) {
      return failure(error);
    }
  },
);
