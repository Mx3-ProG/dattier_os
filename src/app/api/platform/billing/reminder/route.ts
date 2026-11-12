import { NextRequest } from "next/server";
import { authenticated, assertOrigin, json, failure } from "@/features/platform/http";
import { planBillingReady } from "@/features/platform/plan-billing";
import { one } from "@/infrastructure/database/db";
export const runtime="nodejs";
export async function POST(req:NextRequest) {
  try {
    await assertOrigin(req);
    if(!planBillingReady())return json({organization:null});
    return json(await authenticated(undefined,db=>one<{organization:string|null}>(db,"SELECT app.claim_billing_reminder() AS organization")));
  }catch(e){return failure(e);}
}
