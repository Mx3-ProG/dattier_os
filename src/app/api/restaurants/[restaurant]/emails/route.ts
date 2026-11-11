import { NextRequest } from "next/server";
import { authenticated, assertOrigin, readBody, json, failure, rateLimit } from "@/features/platform/http";
import { withRequestContext } from "@/features/ops-security/context";
import { emailPerform, emailState } from "@/features/email/service";
import { drainEmails } from "@/features/email";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
const path = "/api/restaurants/[restaurant]/emails";

export const GET = withRequestContext(path, async (_req: NextRequest, c: Context) => {
  try {
    const { restaurant } = await c.params;
    return json(await authenticated(restaurant, (db, user) => emailState(db, user, restaurant)));
  } catch (error) {
    return failure(error);
  }
});

export const POST = withRequestContext(path, async (req: NextRequest, c: Context) => {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const body = await readBody(req, 40_000);
    const result = await authenticated(restaurant, async (db, user) => {
      await rateLimit(db, `emails:${user.id}`, 40);
      return emailPerform(db, user, restaurant, body);
    });
    // Le test part après validation de la transaction, hors transaction, et son résultat
    // est renvoyé tout de suite à l'écran.
    const test = result.testId ? (await drainEmails(restaurant, { only: result.testId }))[0] : undefined;
    const state = await authenticated(restaurant, (db, user) => emailState(db, user, restaurant));
    return json({ ...state, result: { ...result, test } });
  } catch (error) {
    return failure(error);
  }
});
