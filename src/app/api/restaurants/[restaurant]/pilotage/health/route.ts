import { NextRequest } from "next/server";
import { failure, json } from "@/features/platform/http";
import { customerHealthState } from "@/features/pilotage-addons/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try { return json(await customerHealthState((await context.params).restaurant)); }
  catch (error) { return failure(error); }
}
