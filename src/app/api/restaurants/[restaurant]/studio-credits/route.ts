import { NextRequest } from "next/server";
import { z } from "zod";
import { studioCreditCheckout,studioCreditState } from "@/features/credits/studio";
import { assertOrigin,failure,json,readBody } from "@/features/platform/http";
export const runtime="nodejs";
type Context={params:Promise<{restaurant:string}>};
export async function GET(_req:NextRequest,context:Context){
  try{return json(await studioCreditState((await context.params).restaurant));}
  catch(error){return failure(error);}
}
export async function POST(req:NextRequest,context:Context){
  try{await assertOrigin(req);const body=z.object({pack:z.number().int()}).strict().parse(await readBody(req,1024));return json(await studioCreditCheckout((await context.params).restaurant,body.pack));}
  catch(error){return failure(error);}
}
