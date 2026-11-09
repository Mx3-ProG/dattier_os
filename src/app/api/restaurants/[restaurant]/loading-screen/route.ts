import { NextRequest } from "next/server";
import { loadingScreen, saveLoadingScreen } from "@/features/addons/store-service";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
export async function GET(_req: NextRequest, context: Context) {
  try {
    return json(await loadingScreen((await context.params).restaurant));
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(req: NextRequest, context: Context) {
  try {
    await assertOrigin(req);
    return json(await saveLoadingScreen((await context.params).restaurant, await readBody(req)));
  } catch (error) {
    return failure(error);
  }
}
