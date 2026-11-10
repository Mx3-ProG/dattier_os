import { NextRequest } from "next/server";
import { tradePerform, tradeState } from "@/features/trade/service";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string; tool: string }> };
export async function GET(_req: NextRequest, context: Context) {
  try {
    const { restaurant, tool } = await context.params;
    return json(await tradeState(restaurant, tool));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    await assertOrigin(req);
    const { restaurant, tool } = await context.params;
    return json(await tradePerform(restaurant, tool, await readBody(req, 64_000)));
  } catch (error) {
    return failure(error);
  }
}
