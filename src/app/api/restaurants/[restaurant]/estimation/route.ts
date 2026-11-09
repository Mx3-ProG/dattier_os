import { NextRequest } from "next/server";
import { estimationState, saveEstimation } from "@/features/estimation/service";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try { return json(await estimationState((await context.params).restaurant)); }
  catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest, context: Context) {
  try {
    await assertOrigin(request);
    return json(await saveEstimation((await context.params).restaurant, await readBody(request)));
  } catch (error) { return failure(error); }
}
