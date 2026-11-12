import { NextRequest } from "next/server";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";
import { customerContextPerform, customerContextState } from "@/features/pilotage-addons/customer-context";

export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try { return json(await customerContextState((await context.params).restaurant)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try { await assertOrigin(request); return json(await customerContextPerform((await context.params).restaurant, await readBody(request))); }
  catch (error) { return failure(error); }
}
