import { randomUUID } from "node:crypto";
import { z } from "zod";
import { can } from "@/core/permissions";
import { authenticated } from "@/features/platform/public";
import { one, rows, type DB } from "@/infrastructure/database/db";
import type { Actor } from "@/infrastructure/auth/session";
import { visitPrice, recurringDates } from "./domain";
import { billingAction, billingActionSchema } from "@/features/billing/public";
import { emit } from "@/features/events/public";

const id = z.string().uuid();
const text = z.string().trim().min(2).max(200);
const instant = z.iso.datetime({ offset: true });
const commands = z.discriminatedUnion("action", [
  z.object({ action: z.literal("beneficiary"), customerId: z.string().min(1), name: text, address: z.string().max(500) }),
  z.object({ action: z.literal("worker"), profileId: z.string().min(1), skills: z.array(text).max(30), serviceArea: z.string().max(200) }),
  z.object({ action: z.literal("grant"), beneficiaryId: id, profileId: z.string().min(1) }),
  z.object({ action: z.literal("revoke"), grantId: id }),
  z.object({ action: z.literal("service"), name: text, hourlyCents: z.number().int().min(0).max(1_000_000), minimumMinutes: z.number().int().min(15).max(1440), travelCents: z.number().int().min(0).max(100_000), requiredSkills:z.array(text).max(20).default([]), complianceRequired: z.boolean() }),
  z.object({ action: z.literal("verifyService"), serviceId: id, evidence: z.string().trim().min(10).max(2000) }),
  z.object({ action: z.literal("availability"), workerId: id, startsAt: instant, endsAt: instant, available: z.boolean() }),
  z.object({ action: z.literal("visit"), beneficiaryId: id, workerId: id.nullable(), serviceId: id, startsAt: instant, endsAt: instant, frequency: z.enum(["once", "daily", "weekly"]).default("once"), occurrences: z.number().int().min(1).max(52).default(1) }),
  z.object({ action: z.literal("assign"), visitId: id, workerId: id }),
  z.object({ action: z.literal("reschedule"), visitId: id, startsAt: instant, endsAt: instant }),
  z.object({ action: z.literal("status"), visitId: id, status: z.enum(["confirmed", "in_progress", "completed", "cancelled"]) }),
  z.object({ action: z.literal("report"), visitId: id, report: z.string().trim().min(2).max(5000), declaredMinutes: z.number().int().min(0).max(1440) }),
  z.object({ action: z.literal("validate"), visitId: id, validatedMinutes: z.number().int().min(0).max(1440) }),
  z.object({ action: z.literal("invoice"), visitId: id, rateId: z.string().nullable().default(null) }),
  z.object({ action: z.literal("invoiceMonth"), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), rateId: z.string().nullable().default(null) }),
]);

async function requireHome(db: DB, restaurant: string) {
  const result = await one<{ industry: string }>(db, "SELECT industry FROM restaurants WHERE id=$1", [restaurant]);
  if (result.industry !== "home_assistance") throw new Error("Secteur aide à la personne requis.");
}
async function requirePermission(db: DB, restaurant: string, user: Actor, permission: "customers" | "team" | "reservations" | "finance" | "catalog") {
  const membership = await rows<{ role: string }>(db, "SELECT role FROM memberships WHERE restaurant_id=$1 AND profile_id=$2", [restaurant, user.id]);
  if (!membership.some((m) => can(m.role as Parameters<typeof can>[0], permission)) && user.role !== "SUPER_ADMIN")
    throw new Error("Accès refusé pour ce profil.");
}

async function requireWorkerAvailable(db: DB, restaurant: string, workerId: string, startsAt: string, endsAt: string, serviceId?:string) {
  const result = await one<{active:boolean;open:boolean;blocked:boolean;qualified:boolean}>(db, `SELECT w.active,
    EXISTS(SELECT 1 FROM home_worker_availability a WHERE a.restaurant_id=w.restaurant_id AND a.worker_id=w.id
      AND a.available AND a.starts_at<=$3::timestamptz AND a.ends_at>=$4::timestamptz) AS open,
    EXISTS(SELECT 1 FROM home_worker_availability a WHERE a.restaurant_id=w.restaurant_id AND a.worker_id=w.id
      AND NOT a.available AND a.starts_at<$4::timestamptz AND $3::timestamptz<a.ends_at) AS blocked
    ($5::text IS NULL OR EXISTS(SELECT 1 FROM home_services s WHERE s.id=$5 AND s.restaurant_id=w.restaurant_id AND w.skills @> s.required_skills)) AS qualified
    FROM home_workers w WHERE w.id=$2 AND w.restaurant_id=$1`, [restaurant,workerId,startsAt,endsAt,serviceId??null]);
  if (!result.active || !result.open || result.blocked || !result.qualified) throw new Error("Intervenant indisponible ou non qualifié sur ce créneau.");
}

async function draftVisitInvoice(db:DB,restaurant:string,user:Actor,visitId:string,rateId:string|null) {
  const v=await one<{ id:string;service_name:string;starts_at:string;billable_cents:number;customer_name:string;address:string }>(db,
    "SELECT v.id,v.service_name,v.starts_at,v.billable_cents,c.name AS customer_name,b.address FROM home_visits v JOIN home_beneficiaries b ON b.id=v.beneficiary_id AND b.restaurant_id=v.restaurant_id JOIN customers c ON c.id=b.customer_id AND c.restaurant_id=v.restaurant_id WHERE v.id=$1 AND v.restaurant_id=$2 AND v.status='completed' AND v.validated_minutes IS NOT NULL AND v.invoice_id IS NULL FOR UPDATE OF v", [visitId,restaurant]);
  if (!v.billable_cents) throw new Error("Montant nul : aucune facture à émettre.");
  const draft=billingActionSchema.parse({action:"draft",customerName:v.customer_name,customerAddress:v.address,customerSiren:null,customerVat:null,isBusiness:false,note:`Intervention ${v.id}`,serviceDate:new Date(v.starts_at).toISOString().slice(0,10),lines:[{label:v.service_name,quantity:1,unitGross:v.billable_cents,rateId}]});
  const invoice=await billingAction(db,restaurant,user,draft) as {id:string};
  await db.query("UPDATE home_visits SET invoice_id=$3 WHERE id=$1 AND restaurant_id=$2 AND invoice_id IS NULL",[visitId,restaurant,invoice.id]);
  return invoice;
}

/** Créneaux réellement couverts par une disponibilité, hors absence et conflit. */
export async function homeSlots(restaurant: string, serviceId: string, day: string) {
  const date=z.iso.date().parse(day), parsedId=id.parse(serviceId);
  return authenticated(restaurant,async(db,user)=>{
    await requireHome(db,restaurant);
    await requirePermission(db,restaurant,user,"reservations");
    const service=await one<{minimum_minutes:number}>(db,"SELECT minimum_minutes FROM home_services WHERE id=$1 AND restaurant_id=$2 AND active AND (NOT compliance_required OR compliance_verified_at IS NOT NULL)",[parsedId,restaurant]);
    const rowsOfDay=await rows<{worker_id:string;starts_at:string;ends_at:string}>(db,
      "SELECT a.worker_id,a.starts_at,a.ends_at FROM home_worker_availability a JOIN home_workers w ON w.id=a.worker_id AND w.restaurant_id=a.restaurant_id WHERE a.restaurant_id=$1 AND a.available AND w.active AND a.starts_at<$3::timestamptz AND a.ends_at>$2::timestamptz ORDER BY a.starts_at LIMIT 200",
      [restaurant,`${date}T00:00:00Z`,new Date(Date.parse(`${date}T00:00:00Z`)+86_400_000).toISOString()]);
    const candidates:{workerId:string;startsAt:string;endsAt:string}[]=[];
    const dayStart=Date.parse(`${date}T00:00:00Z`),dayEnd=dayStart+86_400_000;
    for (const availability of rowsOfDay) {
      const first=Math.ceil(Math.max(dayStart,Date.parse(availability.starts_at))/1_800_000)*1_800_000;
      for(let start=first;start+service.minimum_minutes*60_000<=Math.min(dayEnd,Date.parse(availability.ends_at));start+=1_800_000)
        candidates.push({workerId:availability.worker_id,startsAt:new Date(start).toISOString(),endsAt:new Date(start+service.minimum_minutes*60_000).toISOString()});
    }
    const available=[];
    for(const candidate of candidates.slice(0,500)) {
      try { await requireWorkerAvailable(db,restaurant,candidate.workerId,candidate.startsAt,candidate.endsAt,parsedId); }
      catch { continue; }
      const conflict=await rows(db,"SELECT id FROM home_visits WHERE restaurant_id=$1 AND worker_id=$2 AND status NOT IN ('cancelled','completed') AND starts_at<$4::timestamptz+interval '30 minutes' AND $3::timestamptz<ends_at+interval '30 minutes' LIMIT 1",[restaurant,candidate.workerId,candidate.startsAt,candidate.endsAt]);
      if (!conflict.length) available.push(candidate);
      if (available.length>=30) break;
    }
    return available;
  });
}

export async function homeState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await requireHome(db, restaurant);
    await requirePermission(db, restaurant, user, "customers");
    return {
      customers: await rows(db, "SELECT id,name FROM customers WHERE restaurant_id=$1 ORDER BY name LIMIT 200", [restaurant]),
      team: await rows(db, "SELECT p.id,p.name FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.restaurant_id=$1 AND p.status='active' ORDER BY p.name LIMIT 200", [restaurant]),
      services: await rows(db, "SELECT id,name,hourly_cents,minimum_minutes,travel_cents,required_skills,compliance_required,compliance_verified_at,active FROM home_services WHERE restaurant_id=$1 ORDER BY name LIMIT 200", [restaurant]),
      taxRates: await rows(db, "SELECT id,label,rate_bp FROM fin_tax_rates WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY rate_bp", [restaurant]),
      availability: await rows(db, "SELECT id,worker_id,starts_at,ends_at,available FROM home_worker_availability WHERE restaurant_id=$1 AND ends_at>now() ORDER BY starts_at LIMIT 200", [restaurant]),
      beneficiaries: await rows(db, "SELECT id,customer_id,name,address,created_at FROM home_beneficiaries WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 200", [restaurant]),
      workers: await rows(db, "SELECT id,profile_id,skills,service_area,active FROM home_workers WHERE restaurant_id=$1 ORDER BY id LIMIT 200", [restaurant]),
      grants: await rows(db, "SELECT id,beneficiary_id,profile_id,granted_at FROM home_relative_grants WHERE restaurant_id=$1 AND revoked_at IS NULL ORDER BY granted_at DESC LIMIT 200", [restaurant]),
      visits: await rows(db, "SELECT id,beneficiary_id,worker_id,service_id,service_name,starts_at,ends_at,status,price_cents,declared_minutes,validated_minutes,billable_cents,invoice_id,report FROM home_visits WHERE restaurant_id=$1 ORDER BY starts_at DESC LIMIT 200", [restaurant]),
    };
  });
}

export async function homePerform(restaurant: string, raw: unknown) {
  const input = commands.parse(raw);
  return authenticated(restaurant, async (db, user) => {
    await requireHome(db, restaurant);
    const permission = input.action === "beneficiary" || input.action === "grant" || input.action === "revoke" ? "customers"
      : input.action === "worker" ? "team" : input.action === "service" || input.action === "verifyService" ? "catalog"
      : input.action === "validate" || input.action === "invoice" || input.action === "invoiceMonth" ? "finance" : "reservations";
    await requirePermission(db, restaurant, user, permission);
    let record: { id: string } | null = null;
    switch (input.action) {
      case "service": record = await one(db, "INSERT INTO home_services(id,restaurant_id,name,hourly_cents,minimum_minutes,travel_cents,required_skills,compliance_required) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [randomUUID(),restaurant,input.name,input.hourlyCents,input.minimumMinutes,input.travelCents,input.requiredSkills,input.complianceRequired]); break;
      case "verifyService": record = await one(db, "UPDATE home_services SET compliance_verified_at=now(),compliance_evidence=$3 WHERE id=$1 AND restaurant_id=$2 AND compliance_required RETURNING id", [input.serviceId,restaurant,input.evidence]); break;
      case "availability": {
        if (Date.parse(input.endsAt)<=Date.parse(input.startsAt)) throw new Error("Créneau invalide.");
        record = await one(db, "INSERT INTO home_worker_availability(id,restaurant_id,worker_id,starts_at,ends_at,available) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [randomUUID(),restaurant,input.workerId,input.startsAt,input.endsAt,input.available]);
        break;
      }
      case "beneficiary": {
        await one(db, "SELECT id FROM customers WHERE id=$1 AND restaurant_id=$2", [input.customerId, restaurant]);
        record = await one(db, "INSERT INTO home_beneficiaries(id,restaurant_id,customer_id,name,address) VALUES($1,$2,$3,$4,$5) RETURNING id", [randomUUID(), restaurant, input.customerId, input.name, input.address]);
        break;
      }
      case "worker": {
        await one(db, "SELECT profile_id FROM memberships WHERE profile_id=$1 AND restaurant_id=$2", [input.profileId, restaurant]);
        record = await one(db, "INSERT INTO home_workers(id,restaurant_id,profile_id,skills,service_area) VALUES($1,$2,$3,$4,$5) RETURNING id", [randomUUID(), restaurant, input.profileId, input.skills, input.serviceArea]);
        break;
      }
      case "grant": {
        await one(db, "SELECT id FROM home_beneficiaries WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL", [input.beneficiaryId, restaurant]);
        record = await one(db, "INSERT INTO home_relative_grants(id,restaurant_id,beneficiary_id,profile_id,granted_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [randomUUID(), restaurant, input.beneficiaryId, input.profileId, user.id]);
        break;
      }
      case "revoke": record = await one(db, "UPDATE home_relative_grants SET revoked_at=now() WHERE id=$1 AND restaurant_id=$2 AND revoked_at IS NULL RETURNING id", [input.grantId, restaurant]); break;
      case "visit": {
        const service = await one<{name:string;hourly_cents:number;minimum_minutes:number;travel_cents:number}>(db,
          "SELECT name,hourly_cents,minimum_minutes,travel_cents FROM home_services WHERE id=$1 AND restaurant_id=$2 AND active AND (NOT compliance_required OR compliance_verified_at IS NOT NULL)", [input.serviceId,restaurant]);
        const dates = recurringDates(input.startsAt,input.endsAt,input.frequency === "once" ? "daily" : input.frequency,input.frequency === "once" ? 1 : input.occurrences);
        const minutes = (Date.parse(input.endsAt)-Date.parse(input.startsAt))/60000;
        if (minutes < service.minimum_minutes || !Number.isInteger(minutes)) throw new Error("Durée inférieure au minimum de la prestation.");
        const recurrence = dates.length>1 ? randomUUID() : null;
        for (const date of dates) {
          const visitId = randomUUID();
          if (input.workerId) await requireWorkerAvailable(db, restaurant, input.workerId, date.startsAt, date.endsAt,input.serviceId);
          record = await one(db, "INSERT INTO home_visits(id,restaurant_id,beneficiary_id,worker_id,service_id,service_name,starts_at,ends_at,price_cents,hourly_cents,travel_cents,recurrence_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id", [visitId,restaurant,input.beneficiaryId,input.workerId,input.serviceId,service.name,date.startsAt,date.endsAt,visitPrice(service.hourly_cents,minutes,service.travel_cents),service.hourly_cents,service.travel_cents,recurrence]);
        }
        break;
      }
      case "assign": {
        const visit = await one<{starts_at:string;ends_at:string;service_id:string|null}>(db,"SELECT starts_at,ends_at,service_id FROM home_visits WHERE id=$1 AND restaurant_id=$2 AND status IN ('requested','confirmed')",[input.visitId,restaurant]);
        await requireWorkerAvailable(db,restaurant,input.workerId,visit.starts_at,visit.ends_at,visit.service_id??undefined);
        record = await one(db, "UPDATE home_visits SET worker_id=$3 WHERE id=$1 AND restaurant_id=$2 AND status IN ('requested','confirmed') RETURNING id", [input.visitId, restaurant, input.workerId]); break;
      }
      case "reschedule": {
        if (Date.parse(input.endsAt)<=Date.parse(input.startsAt)) throw new Error("Créneau invalide.");
        const visit=await one<{worker_id:string|null;service_id:string|null;starts_at:string;ends_at:string}>(db,"SELECT worker_id,service_id,starts_at,ends_at FROM home_visits WHERE id=$1 AND restaurant_id=$2 AND status IN ('requested','confirmed')",[input.visitId,restaurant]);
        if(Date.parse(input.endsAt)-Date.parse(input.startsAt)!==Date.parse(visit.ends_at)-Date.parse(visit.starts_at)) throw new Error("Le report doit conserver la durée tarifée.");
        if(visit.worker_id) await requireWorkerAvailable(db,restaurant,visit.worker_id,input.startsAt,input.endsAt,visit.service_id??undefined);
        record=await one(db,"UPDATE home_visits SET starts_at=$3,ends_at=$4,status='requested' WHERE id=$1 AND restaurant_id=$2 AND status IN ('requested','confirmed') RETURNING id",[input.visitId,restaurant,input.startsAt,input.endsAt]);
        break;
      }
      case "status": record = await one(db, "UPDATE home_visits SET status=$3 WHERE id=$1 AND restaurant_id=$2 AND ((status='requested' AND $3 IN ('confirmed','cancelled')) OR (status='confirmed' AND $3 IN ('in_progress','cancelled')) OR (status='in_progress' AND $3='completed')) AND ($3='cancelled' OR worker_id IS NOT NULL) AND ($3<>'completed' OR declared_minutes IS NOT NULL) RETURNING id", [input.visitId, restaurant, input.status]); break;
      case "report": record = await one(db, "UPDATE home_visits SET report=$3,declared_minutes=$4 WHERE id=$1 AND restaurant_id=$2 AND status='in_progress' AND validated_minutes IS NULL RETURNING id", [input.visitId, restaurant, input.report, input.declaredMinutes]); break;
      case "validate": record = await one(db, "UPDATE home_visits SET validated_minutes=$3,billable_cents=CASE WHEN hourly_cents IS NULL THEN price_cents ELSE round(hourly_cents*$3::numeric/60)::integer+coalesce(travel_cents,0) END WHERE id=$1 AND restaurant_id=$2 AND status='completed' AND declared_minutes IS NOT NULL AND validated_minutes IS NULL RETURNING id", [input.visitId, restaurant, input.validatedMinutes]); break;
      case "invoice": {
        await draftVisitInvoice(db,restaurant,user,input.visitId,input.rateId);
        record={id:input.visitId};
        break;
      }
      case "invoiceMonth": {
        const start=`${input.month}-01`;
        const end=new Date(Date.UTC(Number(input.month.slice(0,4)),Number(input.month.slice(5,7)),1)).toISOString().slice(0,10);
        const pending=await rows<{id:string}>(db,"SELECT id FROM home_visits WHERE restaurant_id=$1 AND starts_at>=$2::date AND starts_at<$3::date AND status='completed' AND validated_minutes IS NOT NULL AND invoice_id IS NULL AND billable_cents>0 ORDER BY starts_at LIMIT 100 FOR UPDATE SKIP LOCKED",[restaurant,start,end]);
        for(const visit of pending) await draftVisitInvoice(db,restaurant,user,visit.id,input.rateId);
        record={id:`${input.month}:${pending.length}`};
        break;
      }
    }
    if (!record) throw new Error("Aucune opération réalisée.");
    await db.query("INSERT INTO audit_logs(id,restaurant_id,actor,action,object_id) VALUES($1,$2,$3,$4,$5)", [randomUUID(), restaurant, user.id, `home.${input.action}`, record.id]);
    if (["visit","status","report","validate"].includes(input.action))
      await emit(db,restaurant,"home.visit.updated",{action:input.action,visitId:record.id},`home:${input.action}:${record.id}:${randomUUID()}`);
    return record;
  });
}
