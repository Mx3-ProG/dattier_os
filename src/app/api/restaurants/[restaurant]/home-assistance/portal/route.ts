import { NextRequest } from "next/server";
import { homePortal, portalAction } from "@/features/home-assistance/portal";
import { assertOrigin, failure, json, readBody } from "@/features/platform/public";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
export async function GET(_req: NextRequest, context: Context) {
  try { return json(await homePortal((await context.params).restaurant)); }
  catch (error) { return failure(error); }
}
export async function POST(req: NextRequest, context: Context) {
  try { await assertOrigin(req); return json(await portalAction((await context.params).restaurant,await readBody(req))); }
  catch (error) { return failure(error); }
}
