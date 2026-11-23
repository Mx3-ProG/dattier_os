import { NextRequest } from "next/server";
import { homePerform, homeState, homeSlots } from "@/features/home-assistance/service";
import { assertOrigin, failure, json, readBody } from "@/features/platform/public";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
export async function GET(req: NextRequest, context: Context) {
  try {
    const restaurant=(await context.params).restaurant;
    const serviceId=req.nextUrl.searchParams.get("serviceId");
    const day=req.nextUrl.searchParams.get("day");
    return json(serviceId && day ? await homeSlots(restaurant,serviceId,day) : await homeState(restaurant));
  }
  catch (error) { return failure(error); }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    await assertOrigin(req);
    return json(await homePerform((await context.params).restaurant, await readBody(req)));
  } catch (error) { return failure(error); }
}
