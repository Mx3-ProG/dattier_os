import { NextRequest } from "next/server";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";
import { paymentRecoveryRecord, paymentRecoveryState } from "@/features/pilotage-addons/payment-recovery";

export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try { return json(await paymentRecoveryState((await context.params).restaurant)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try { await assertOrigin(request); return json(await paymentRecoveryRecord((await context.params).restaurant, await readBody(request))); }
  catch (error) { return failure(error); }
}
