import { NextRequest } from "next/server";
import { addonState, addonCheckout, cancelAddon, monthlyAddonIds, type MonthlyAddonId } from "@/features/addons/service";
import { assertOrigin, json, failure } from "@/features/platform/http";
export const runtime="nodejs";
type Context={params:Promise<{restaurant:string}>};
function selected(req:NextRequest): MonthlyAddonId {
  const value=req.nextUrl.searchParams.get("addon")??"invoices";
  if (!monthlyAddonIds.includes(value as MonthlyAddonId)) throw new Error("Add-on inconnu.");
  return value as MonthlyAddonId;
}
export async function GET(_req:NextRequest,c:Context){try{return json(await addonState((await c.params).restaurant));}catch(e){return failure(e);}}
export async function POST(req:NextRequest,c:Context){try{await assertOrigin(req);return json(await addonCheckout((await c.params).restaurant,selected(req)));}catch(e){return failure(e);}}

export async function DELETE(req:NextRequest,c:Context){try{await assertOrigin(req);return json(await cancelAddon((await c.params).restaurant,selected(req)));}catch(e){return failure(e);}}
