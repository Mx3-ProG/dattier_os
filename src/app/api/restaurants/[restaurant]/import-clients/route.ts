import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import { authenticated, assertOrigin, readBody, json, failure } from "@/features/platform/http";
import { customerImport } from "@/features/onboarding/customer-import";
import { z } from "zod";
const schema=z.object({
  csv:z.string().min(1),nameColumn:z.number().int(),contactColumn:z.number().int(),commit:z.boolean(),
});
async function routePOST(req:NextRequest,{params}:{params:Promise<{restaurant:string}>}) {
  try {
    await assertOrigin(req);
    const { restaurant }=await params;
    const body=schema.parse(await readBody(req,10_000_000));
    return json(await authenticated(restaurant,async(db)=>{
      const admin=await db.query<{allowed:boolean}>("SELECT app.addon_store_manager($1) AS allowed",[restaurant]);
      if (!admin.rows[0]?.allowed) throw new Error("Import réservé à l’administrateur de l’établissement.");
      return customerImport(db,restaurant,body);
    }));
  } catch(error){return failure(error);}
}
export const POST=withRequestContext("/api/restaurants/[restaurant]/import-clients",routePOST);
