import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticated } from "@/features/platform/http";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { requirePermission } from "@/core/permissions";
import { requirePaidAddon } from "@/features/platform/entitlements";

export const scannerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), city: z.string().trim().min(2).max(120), sector: z.string().trim().min(2).max(120), radiusKm: z.number().int().min(1).max(50) }),
  z.object({ action: z.literal("step"), scanId: z.string().uuid() }),
  z.object({ action: z.literal("qualify"), prospectId: z.string().uuid(), status: z.enum(["review", "qualified", "accepted", "refused"]), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("transfer"), prospectId: z.string().uuid() }),
]);
type Scan = { id: string; city: string; sector: string; radius_km: number; status: string; latitude: number | null; longitude: number | null; naf_codes: string[]; page: number; total_pages: number; found_count: number };
type GeoResult = { nom?: string; centre?: { coordinates?: number[] } };
type Company = { siren?: string; nom_complet?: string; nom_raison_sociale?: string; activite_principale?: string; matching_etablissements?: { siret?: string; adresse?: string; code_postal?: string; latitude?: string; longitude?: string; etat_administratif?: string; nom_commercial?: string }[] };

async function access(db: DB, user: Actor, restaurant: string) {
  const member = await scope(db, user, restaurant);
  requirePermission(member.roles ?? member.role, "analytics");
  await requirePaidAddon(db, restaurant, "prospect-scanner");
  return member;
}

export async function scannerState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant);
    return {
      scans: await rows(db, "SELECT id,city,sector,radius_km,status,page,total_pages,found_count,error_message,sources,created_at,updated_at FROM prospect_scans WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 20", [restaurant]),
      prospects: await rows(db, "SELECT id,scan_id,name,siret,siren,activity,address,city,phone,email,website,score,score_signals,provenance,status,refusal_reason,crm_company_id,updated_at FROM scanner_prospects WHERE restaurant_id=$1 ORDER BY updated_at DESC LIMIT 500", [restaurant]),
      coverage: "France · registre public SIRENE ; recherche par ville, rayon et activité NAF. Les coordonnées directes ne sont pas fournies par cette source.",
    };
  });
}

async function officialJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": "DattierOS-ProspectScanner/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok) throw new Error(`Source publique indisponible (${response.status}).`);
  return response.json() as Promise<T>;
}

export function nafCodes(sector: string, results: { activite_principale?: string }[] = []) {
  const explicit = [...sector.matchAll(/\b(\d{2})\.?([0-9]{2})([a-zA-Z])\b/g)].map((match) => `${match[1]}.${match[2]}${match[3].toUpperCase()}`);
  if (explicit.length) return [...new Set(explicit)].slice(0, 3);
  const counts = new Map<string, number>();
  for (const result of results) if (result.activite_principale) counts.set(result.activite_principale, (counts.get(result.activite_principale) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code]) => code);
}

export function scoreProspect(value: { siret?: string; address?: string; activity?: string; latitude?: number | null; longitude?: number | null }) {
  const signals = [
    value.siret && { label: "SIRET public identifié", points: 35 },
    value.address && { label: "Adresse disponible", points: 20 },
    value.activity && { label: "Activité NAF disponible", points: 20 },
    value.latitude != null && value.longitude != null && { label: "Position connue", points: 15 },
  ].filter(Boolean) as { label: string; points: number }[];
  return { score: signals.reduce((total, signal) => total + signal.points, 0), signals };
}

async function processStep(db: DB, restaurant: string, scanId: string) {
  const scan = await one<Scan>(db, "SELECT id,city,sector,radius_km,status,latitude,longitude,naf_codes,page,total_pages,found_count FROM prospect_scans WHERE restaurant_id=$1 AND id=$2 FOR UPDATE", [restaurant, scanId]);
  if (!["queued", "discovering", "geocoding"].includes(scan.status)) return;
  try {
    if (scan.status === "queued" || scan.status === "geocoding") {
      await db.query("UPDATE prospect_scans SET status='geocoding',updated_at=now() WHERE id=$1", [scan.id]);
      const geo = new URL("https://geo.api.gouv.fr/communes");
      geo.search = new URLSearchParams({ nom: scan.city, fields: "nom,centre", format: "json", geometry: "centre", limit: "1" }).toString();
      const commune = (await officialJson<GeoResult[]>(geo))[0];
      const coords = commune?.centre?.coordinates;
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) throw new Error("Ville française introuvable. Saisissez le nom d’une commune française.");
      let codes = nafCodes(scan.sector);
      if (!codes.length) {
        const search = new URL("https://recherche-entreprises.api.gouv.fr/search");
        search.search = new URLSearchParams({ q: scan.sector, per_page: "25", etat_administratif: "A" }).toString();
        codes = nafCodes(scan.sector, (await officialJson<{ results?: Company[] }>(search)).results ?? []);
      }
      if (!codes.length) throw new Error("Activité non reconnue : saisissez un code NAF, par exemple 56.10A.");
      await db.query("UPDATE prospect_scans SET status='discovering',latitude=$2,longitude=$3,naf_codes=$4,sources=$5::jsonb,updated_at=now() WHERE id=$1",
        [scan.id, coords[1], coords[0], codes, JSON.stringify({ geo_api: "ok", sirene: "running" })]);
      return;
    }
    const url = new URL("https://recherche-entreprises.api.gouv.fr/near_point");
    url.search = new URLSearchParams({ lat: String(scan.latitude), long: String(scan.longitude), radius: String(scan.radius_km), activite_principale: scan.naf_codes.join(","), etat_administratif: "A", per_page: "25", page: String(scan.page), limite_matching_etablissements: "100" }).toString();
    const body = await officialJson<{ results?: Company[]; total_pages?: number }>(url);
    let found = 0;
    for (const company of body.results ?? []) for (const establishment of company.matching_etablissements ?? []) {
      if (!/^\d{14}$/.test(establishment.siret ?? "") || establishment.etat_administratif !== "A") continue;
      const name = establishment.nom_commercial || company.nom_complet || company.nom_raison_sociale || "Entreprise sans nom";
      const latitude = establishment.latitude == null || establishment.latitude === "" ? null : Number(establishment.latitude);
      const longitude = establishment.longitude == null || establishment.longitude === "" ? null : Number(establishment.longitude);
      const result = scoreProspect({ siret: establishment.siret, address: establishment.adresse, activity: company.activite_principale, latitude: latitude != null && Number.isFinite(latitude) ? latitude : null, longitude: longitude != null && Number.isFinite(longitude) ? longitude : null });
      const provenance = [{ field: "identité,activité,adresse", provider: "API Recherche d’entreprises / SIRENE", retrieved_at: new Date().toISOString() }];
      await db.query(`INSERT INTO scanner_prospects(id,restaurant_id,scan_id,name,siret,siren,activity,address,city,latitude,longitude,score,score_signals,provenance)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
        ON CONFLICT (restaurant_id,siret) WHERE siret IS NOT NULL DO UPDATE SET name=excluded.name,activity=excluded.activity,address=excluded.address,
          latitude=excluded.latitude,longitude=excluded.longitude,score=excluded.score,score_signals=excluded.score_signals,provenance=excluded.provenance,updated_at=now()`,
        [randomUUID(), restaurant, scan.id, name, establishment.siret, company.siren ?? null, company.activite_principale ?? null, establishment.adresse ?? null, scan.city,
          latitude != null && Number.isFinite(latitude) ? latitude : null, longitude != null && Number.isFinite(longitude) ? longitude : null, result.score, JSON.stringify(result.signals), JSON.stringify(provenance)]);
      found++;
    }
    const totalPages = Math.min(body.total_pages ?? 1, 10);
    const done = scan.page >= totalPages;
    await db.query("UPDATE prospect_scans SET status=$2,page=$3,total_pages=$4,found_count=found_count+$5,sources=$6::jsonb,updated_at=now() WHERE id=$1",
      [scan.id, done ? "completed" : "discovering", scan.page + (done ? 0 : 1), totalPages, found, JSON.stringify({ geo_api: "ok", sirene: done ? "ok" : "running" })]);
  } catch (cause) {
    await db.query("UPDATE prospect_scans SET status=$2,error_message=$3,sources=$4::jsonb,updated_at=now() WHERE id=$1",
      [scan.id, scan.found_count ? "partial" : "failed", (cause as Error).message.slice(0, 500), JSON.stringify({ geo_api: scan.latitude == null ? "failed" : "ok", sirene: "failed" })]);
  }
}

export async function scannerPerform(restaurant: string, raw: unknown) {
  const action = scannerActionSchema.parse(raw);
  await authenticated(restaurant, async (db, user) => {
    await access(db, user, restaurant);
    if (action.action === "start") {
      const recent = await one<{ count: number }>(db, "SELECT count(*)::int AS count FROM prospect_scans WHERE restaurant_id=$1 AND created_at>now()-interval '1 day'", [restaurant]);
      if (recent.count >= 10) throw new Error("Limite de 10 scans par jour atteinte pour cet établissement.");
      await db.query("INSERT INTO prospect_scans(id,restaurant_id,city,sector,radius_km) VALUES($1,$2,$3,$4,$5)", [randomUUID(), restaurant, action.city, action.sector, action.radiusKm]);
    } else if (action.action === "step") {
      await processStep(db, restaurant, action.scanId);
    } else if (action.action === "qualify") {
      const changed = await db.query("UPDATE scanner_prospects SET status=$3,refusal_reason=$4,updated_at=now() WHERE restaurant_id=$1 AND id=$2 RETURNING id", [restaurant, action.prospectId, action.status, action.status === "refused" ? action.reason ?? null : null]);
      if (!changed.rows.length) throw new Error("Prospect introuvable dans cet établissement.");
    } else {
      await requirePaidAddon(db, restaurant, "pipeline-crm");
      const prospect = await one<{ id: string; name: string; siret: string | null; siren: string | null; activity: string | null; address: string | null; city: string | null; phone: string | null; email: string | null; website: string | null; score: number; score_signals: unknown; provenance: unknown }>(db,
        "SELECT id,name,siret,siren,activity,address,city,phone,email,website,score,score_signals,provenance FROM scanner_prospects WHERE restaurant_id=$1 AND id=$2", [restaurant, action.prospectId]);
      const existing = prospect.siret ? await rows<{ id: string }>(db, "SELECT id FROM crm_companies WHERE restaurant_id=$1 AND siret=$2", [restaurant, prospect.siret]) : [];
      const companyId = existing[0]?.id ?? randomUUID();
      if (!existing.length) await db.query(`INSERT INTO crm_companies(id,restaurant_id,name,siret,activity,address,city,phone,email,website,source,score,score_signals,provenance)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'scanner', $11,$12::jsonb,$13::jsonb)`,
        [companyId, restaurant, prospect.name, prospect.siret, prospect.activity, prospect.address, prospect.city, prospect.phone, prospect.email, prospect.website, prospect.score, JSON.stringify(prospect.score_signals), JSON.stringify(prospect.provenance)]);
      await db.query("UPDATE scanner_prospects SET crm_company_id=$3,status='accepted',updated_at=now() WHERE restaurant_id=$1 AND id=$2", [restaurant, prospect.id, companyId]);
    }
  });
  return scannerState(restaurant);
}
