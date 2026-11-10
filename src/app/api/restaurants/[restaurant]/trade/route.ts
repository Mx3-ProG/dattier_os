import { NextRequest } from "next/server";
import { tradeOverview } from "@/features/trade/service";
import { failure, json } from "@/features/platform/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
export async function GET(_req: NextRequest, context: Context) {
  try {
    return json(await tradeOverview((await context.params).restaurant));
  } catch (error) {
    return failure(error);
  }
}
