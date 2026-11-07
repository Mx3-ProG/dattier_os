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
import { readAppearance, saveAppearance } from "@/features/appearance/service";
export const GET = withRequestContext("/api/me/appearance", async () => {
  try {
    return json(
      await authenticated(undefined, (db, user) => readAppearance(db, user.id)),
    );
  } catch (error) {
    return failure(error);
  }
});
export const PUT = withRequestContext(
  "/api/me/appearance",
  async (req: NextRequest) => {
    try {
      await assertOrigin(req);
      const body = await readBody(req, 1024);
      return json(
        await authenticated(undefined, async (db, user) => {
          if (req.headers.get("x-appearance-account") !== user.id)
            throw new Error("Votre compte a été modifié. Rechargez la page.");
          await rateLimit(db, `appearance:${user.id}`, 30);
          return saveAppearance(db, user.id, body);
        }),
      );
    } catch (error) {
      return failure(error);
    }
  },
);
