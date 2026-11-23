import { actor } from "@/infrastructure/auth/session";
import { getDb, rows } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { z } from "zod";

/** Lectures client, proche et intervenant par les politiques RLS de l'établissement. */
export async function homePortal(restaurant: string) {
  const user = await actor();
  return withDatabaseContext({ userId: user.id, restaurantId: restaurant }, async () => {
    const db = await getDb();
    return db.transaction(async tx => {
      const beneficiaries = await rows(tx,
        "SELECT id,name,address FROM home_beneficiaries WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY name LIMIT 200", [restaurant]);
      const visits = await rows(tx,
        "SELECT id,beneficiary_id,worker_id,service_name,starts_at,ends_at,status,declared_minutes,validated_minutes FROM home_visits WHERE restaurant_id=$1 ORDER BY starts_at DESC LIMIT 200", [restaurant]);
      const services = await rows(tx,"SELECT id,name,hourly_cents,minimum_minutes,travel_cents FROM app.home_portal_services($1)",[restaurant]);
      if (beneficiaries.length === 0 && visits.length === 0) throw new Error("Accès refusé pour ce profil.");
      return { beneficiaries, visits, services };
    });
  });
}

const reportInput = z.object({ visitId:z.string().uuid(), report:z.string().trim().min(2).max(5000), declaredMinutes:z.number().int().min(0).max(1440) });
const bookingInput=z.object({beneficiaryId:z.string().uuid(),serviceId:z.string().uuid(),startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true})});
export async function portalAction(restaurant: string, raw: unknown) {
  const input=z.discriminatedUnion("action",[
    reportInput.extend({action:z.literal("report")}),bookingInput.extend({action:z.literal("book")}),
  ]).parse(raw);
  const user=await actor();
  return withDatabaseContext({userId:user.id,restaurantId:restaurant}, async()=>{
    const db=await getDb();
    return db.transaction(async tx=>{
      const result= input.action==="report"
        ? await tx.query<{id:string}>("SELECT app.home_worker_report($1,$2,$3,$4) AS id",[restaurant,input.visitId,input.report,input.declaredMinutes])
        : await tx.query<{id:string}>("SELECT app.home_customer_request($1,$2,$3,$4,$5) AS id",[restaurant,input.beneficiaryId,input.serviceId,input.startsAt,input.endsAt]);
      return result.rows[0];
    });
  });
}
