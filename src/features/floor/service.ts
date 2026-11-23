import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/infrastructure/database/db";
import type { Actor } from "@/infrastructure/auth/session";
import { log, notify } from "@/features/orders/service";
import { requireArrange } from "./access";

const rotation = z.coerce.number().int().min(0).max(359);
export const tableSchema = z
  .object({
    action: z.literal("saveTable"),
    id: z.string().min(1).optional(),
    number: z.coerce.number().int().min(1).max(999),
    capacity: z.coerce.number().int().min(1).max(20),
    /** Zone de rattachement ; à défaut, le nom de zone (créée si besoin). */
    zoneId: z.string().min(1).optional(),
    zone: z.string().trim().min(1).max(60).optional(),
    label: z.string().trim().max(60).default(""),
    shape: z.enum(["round", "square", "rect"]),
    rotation: rotation.optional(),
    bookable: z.boolean(),
    status: z.enum(["free", "cleaning", "unavailable"]).optional(),
  })
  .refine((a) => a.zoneId || a.zone, { message: "Choisissez une zone." });
const zoneName = z.string().trim().min(1).max(60);
export const zoneSchemas = [
  z.object({
    action: z.literal("saveZone"),
    id: z.string().min(1).optional(),
    name: zoneName,
  }),
  z.object({
    action: z.literal("moveZone"),
    id: z.string().min(1),
    direction: z.union([z.literal(-1), z.literal(1)]),
  }),
  z.object({ action: z.literal("deleteZone"), id: z.string().min(1) }),
  z.object({
    action: z.literal("rotateTable"),
    id: z.string().min(1),
    rotation,
  }),
] as const;

/** Réservations encore à venir qui retiennent cette table. */
const upcoming = (db: DB, id: string) =>
  rows<{ guests: number; name: string }>(
    db,
    "SELECT guests,name FROM reservations WHERE table_id=$1 AND status IN ('requested','confirmed','arrived') AND ends_at>now() ORDER BY starts_at",
    [id],
  );

/** Tables actives et plafond de l’offre (null : pas de plafond en Premium). */
export const tableQuota = (db: DB, r: string) =>
  one<{ plan: number; quota: number | null; active: number }>(
    db,
    "SELECT coalesce(app.restaurant_plan(r.id),0) AS plan,app.table_quota(coalesce(app.restaurant_plan(r.id),0)) AS quota,(SELECT count(*)::int FROM dining_tables t WHERE t.restaurant_id=r.id AND t.archived_at IS NULL) AS active FROM restaurants r WHERE r.id=$1",
    [r],
  );
/** Message clair avant que le déclencheur SQL ne refuse la table de trop. */
async function assertRoom(db: DB, r: string) {
  const q = await tableQuota(db, r);
  if (q.quota !== null && q.active >= q.quota)
    throw new Error(
      `Forfait Exploitation : ${q.quota} tables actives au maximum sur le plan de salle, toutes zones confondues. Archivez une table ou choisissez un forfait supérieur.`,
    );
}

const firstZone = (db: DB, r: string) =>
  one<{ id: string }>(
    db,
    "SELECT id FROM floor_zones WHERE restaurant_id=$1 ORDER BY position,created_at LIMIT 1",
    [r],
  );

/** Zone désignée par son nom (anciens clients, imports) : retrouvée ou créée en fin de liste. */
async function zoneByName(db: DB, r: string, name: string) {
  const [found] = await rows<{ id: string }>(
    db,
    "SELECT id FROM floor_zones WHERE restaurant_id=$1 AND lower(name)=lower($2)",
    [r, name],
  );
  if (found) return found.id;
  const id = randomUUID();
  await db.query(
    "INSERT INTO floor_zones(id,restaurant_id,name,position) SELECT $1,$2,$3,coalesce(max(position)+1,0) FROM floor_zones WHERE restaurant_id=$2",
    [id, r, name],
  );
  return id;
}

export async function saveTable(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof tableSchema>,
) {
  await requireArrange(db, r, user);
  const taken = await rows(
    db,
    "SELECT id FROM dining_tables WHERE restaurant_id=$1 AND number=$2 AND id<>$3",
    [r, a.number, a.id ?? ""],
  );
  if (taken.length)
    throw new Error(`Le numéro ${a.number} est déjà utilisé par une table.`);
  const zoneId = a.zoneId
    ? (
        await one<{ id: string }>(
          db,
          "SELECT id FROM floor_zones WHERE id=$1 AND restaurant_id=$2",
          [a.zoneId, r],
        )
      ).id
    : await zoneByName(db, r, a.zone!);
  if (!a.id) {
    await assertRoom(db, r);
    const id = randomUUID();
    await db.query(
      "INSERT INTO dining_tables(id,restaurant_id,number,capacity,zone_id,label,shape,bookable,rotation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        r,
        a.number,
        a.capacity,
        zoneId,
        a.label,
        a.shape,
        a.bookable,
        a.rotation ?? 0,
      ],
    );
    await log(db, r, user.id, `Table ${a.number} ajoutée au plan`, id);
    return id;
  }
  const t = await one<{ status: string; capacity: number }>(
    db,
    "SELECT status,capacity FROM dining_tables WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [a.id, r],
  );
  if (a.capacity < t.capacity) {
    const tooBig = (await upcoming(db, a.id)).filter(
      (x) => x.guests > a.capacity,
    );
    if (tooBig.length)
      throw new Error(
        `Réservation à venir de ${tooBig[0].guests} personnes (${tooBig[0].name}) : réaffectez-la avant de réduire la table.`,
      );
  }
  if (a.status && a.status !== t.status && t.status === "occupied")
    throw new Error("Clôturez d’abord le service de cette table.");
  await db.query(
    "UPDATE dining_tables SET number=$3,capacity=$4,zone_id=$5,label=$6,shape=$7,bookable=$8,status=$9,rotation=coalesce($10,rotation) WHERE id=$1 AND restaurant_id=$2",
    [
      a.id,
      r,
      a.number,
      a.capacity,
      zoneId,
      a.label,
      a.shape,
      a.bookable,
      t.status === "occupied" ? "occupied" : (a.status ?? t.status),
      a.rotation ?? null,
    ],
  );
  await log(db, r, user.id, `Table ${a.number} modifiée`, a.id);
  return a.id;
}

export async function moveTable(
  db: DB,
  r: string,
  user: Actor,
  id: string,
  x: number,
  y: number,
) {
  await requireArrange(db, r, user);
  await one(
    db,
    "UPDATE dining_tables SET pos_x=$3,pos_y=$4 WHERE id=$1 AND restaurant_id=$2 RETURNING id",
    [id, r, x, y],
  );
}

export async function rotateTable(
  db: DB,
  r: string,
  user: Actor,
  id: string,
  angle: number,
) {
  await requireArrange(db, r, user);
  await one(
    db,
    "UPDATE dining_tables SET rotation=$3 WHERE id=$1 AND restaurant_id=$2 RETURNING id",
    [id, r, ((angle % 360) + 360) % 360],
  );
}

export async function tableLifecycle(
  db: DB,
  r: string,
  user: Actor,
  id: string,
  operation: "archive" | "restore" | "delete",
) {
  await requireArrange(db, r, user);
  const t = await one<{
    number: number;
    status: string;
    zone_id: string | null;
    archived_at: string | null;
  }>(
    db,
    "SELECT number,status,zone_id,archived_at FROM dining_tables WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [id, r],
  );
  if (operation !== "restore") {
    if (t.status === "occupied")
      throw new Error("Clôturez d’abord le service de cette table.");
    const next = await upcoming(db, id);
    if (next.length)
      throw new Error(
        `${next.length} réservation(s) à venir sur cette table : réaffectez-les d’abord.`,
      );
  }
  if (operation === "delete") {
    const history = await rows(
      db,
      "SELECT 1 FROM table_sessions WHERE table_id=$1 UNION ALL SELECT 1 FROM reservations WHERE table_id=$1 LIMIT 1",
      [id],
    );
    if (history.length)
      throw new Error(
        "Cette table a un historique de service ou de réservation : archivez-la plutôt.",
      );
    await db.query("DELETE FROM dining_tables WHERE id=$1", [id]);
  } else if (operation === "archive")
    await db.query("UPDATE dining_tables SET archived_at=now() WHERE id=$1", [
      id,
    ]);
  else {
    if (t.archived_at) await assertRoom(db, r);
    // Sa zone a pu être supprimée pendant l’archivage : elle revient dans la première.
    await db.query(
      "UPDATE dining_tables SET archived_at=NULL,zone_id=coalesce(zone_id,$2) WHERE id=$1",
      [id, t.zone_id ?? (await firstZone(db, r)).id],
    );
  }
  const verb = {
    archive: "archivée",
    restore: "restaurée",
    delete: "supprimée",
  };
  await log(db, r, user.id, `Table ${t.number} ${verb[operation]}`, id);
  await notify(db, r, `Plan de salle · table ${t.number} ${verb[operation]}`);
}

/** Positions 0, 1, 2… dans l’ordre courant, pour réordonner sans trou. */
async function zoneOrder(db: DB, r: string) {
  return rows<{ id: string; name: string }>(
    db,
    "SELECT id,name FROM floor_zones WHERE restaurant_id=$1 ORDER BY position,created_at FOR UPDATE",
    [r],
  );
}

export async function saveZone(
  db: DB,
  r: string,
  user: Actor,
  a: { id?: string; name: string },
) {
  await requireArrange(db, r, user);
  const zones = await zoneOrder(db, r);
  if (
    zones.some(
      (z) => z.id !== a.id && z.name.toLowerCase() === a.name.toLowerCase(),
    )
  )
    throw new Error(`Une zone s’appelle déjà « ${a.name} ».`);
  if (!a.id) {
    const id = randomUUID();
    await db.query(
      "INSERT INTO floor_zones(id,restaurant_id,name,position) VALUES($1,$2,$3,$4)",
      [id, r, a.name, zones.length],
    );
    await log(db, r, user.id, `Zone « ${a.name} » ajoutée au plan`, id);
    return id;
  }
  const before = zones.find((z) => z.id === a.id);
  if (!before) throw new Error("Zone introuvable.");
  await db.query("UPDATE floor_zones SET name=$2 WHERE id=$1", [a.id, a.name]);
  await log(
    db,
    r,
    user.id,
    `Zone « ${before.name} » renommée « ${a.name} »`,
    a.id,
  );
  return a.id;
}

export async function moveZone(
  db: DB,
  r: string,
  user: Actor,
  id: string,
  direction: -1 | 1,
) {
  await requireArrange(db, r, user);
  const zones = await zoneOrder(db, r);
  const i = zones.findIndex((z) => z.id === id);
  if (i < 0) throw new Error("Zone introuvable.");
  const j = i + direction;
  if (j < 0 || j >= zones.length) return;
  [zones[i], zones[j]] = [zones[j], zones[i]];
  for (const [position, z] of zones.entries())
    await db.query("UPDATE floor_zones SET position=$2 WHERE id=$1", [
      z.id,
      position,
    ]);
}

export async function deleteZone(db: DB, r: string, user: Actor, id: string) {
  await requireArrange(db, r, user);
  const zones = await zoneOrder(db, r);
  const zone = zones.find((z) => z.id === id);
  if (!zone) throw new Error("Zone introuvable.");
  if (zones.length === 1)
    throw new Error("Gardez au moins une zone sur le plan de salle.");
  const tables = await rows<{ id: string; number: number; history: boolean }>(
    db,
    "SELECT t.id,t.number,(EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id) OR EXISTS(SELECT 1 FROM reservations x WHERE x.table_id=t.id)) AS history FROM dining_tables t WHERE t.zone_id=$1 AND t.restaurant_id=$2 AND t.archived_at IS NULL ORDER BY t.number FOR UPDATE OF t",
    [id, r],
  );
  const kept = tables.filter((t) => t.history);
  if (kept.length)
    throw new Error(
      `La zone « ${zone.name} » contient ${kept.length > 1 ? "les tables" : "la table"} ${kept.map((t) => t.number).join(", ")} avec un historique de service ou de réservation : déplacez-${kept.length > 1 ? "les" : "la"} dans une autre zone ou archivez-${kept.length > 1 ? "les" : "la"} d’abord.`,
    );
  // Les tables sans historique disparaissent avec la zone ; les archivées gardent leur nom de zone.
  if (tables.length)
    await db.query("DELETE FROM dining_tables WHERE id=ANY($1::text[])", [
      tables.map((t) => t.id),
    ]);
  await db.query("DELETE FROM floor_zones WHERE id=$1", [id]);
  for (const [position, z] of zones.filter((z) => z.id !== id).entries())
    await db.query("UPDATE floor_zones SET position=$2 WHERE id=$1", [
      z.id,
      position,
    ]);
  await log(db, r, user.id, `Zone « ${zone.name} » supprimée du plan`, id);
  await notify(db, r, `Plan de salle · zone « ${zone.name} » supprimée`);
}

/** Le propriétaire accorde ou retire le droit d’aménager à un membre. */
export async function setLayoutAccess(
  db: DB,
  r: string,
  admin: Actor,
  profile: string,
  allowed: boolean,
) {
  await one(
    db,
    "SELECT profile_id FROM memberships WHERE restaurant_id=$1 AND profile_id=$2 LIMIT 1",
    [r, profile],
  );
  await db.query(
    "INSERT INTO floor_layout_access(restaurant_id,profile_id,allowed,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,profile_id) DO UPDATE SET allowed=EXCLUDED.allowed,updated_by=EXCLUDED.updated_by,updated_at=now()",
    [r, profile, allowed, admin.id],
  );
  await log(
    db,
    r,
    admin.id,
    allowed
      ? "Droit de modifier le plan de salle accordé"
      : "Droit de modifier le plan de salle retiré",
    profile,
  );
}
