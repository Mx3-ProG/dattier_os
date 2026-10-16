import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log, notify } from "@/features/orders/service";

export const tableSchema = z.object({
  action: z.literal("saveTable"),
  id: z.string().min(1).optional(),
  number: z.coerce.number().int().min(1).max(999),
  capacity: z.coerce.number().int().min(1).max(20),
  zone: z.string().trim().min(1).max(60),
  label: z.string().trim().max(60).default(""),
  shape: z.enum(["round", "square", "rect"]),
  bookable: z.boolean(),
  status: z.enum(["free", "cleaning", "unavailable"]).optional(),
});

/** Réservations encore à venir qui retiennent cette table. */
const upcoming = (db: DB, id: string) =>
  rows<{ guests: number; name: string }>(
    db,
    "SELECT guests,name FROM reservations WHERE table_id=$1 AND status IN ('requested','confirmed','arrived') AND ends_at>now() ORDER BY starts_at",
    [id],
  );

export async function saveTable(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof tableSchema>,
) {
  requirePermission(user.role, "floor");
  const taken = await rows(
    db,
    "SELECT id FROM dining_tables WHERE restaurant_id=$1 AND number=$2 AND id<>$3",
    [r, a.number, a.id ?? ""],
  );
  if (taken.length)
    throw new Error(`Le numéro ${a.number} est déjà utilisé par une table.`);
  if (!a.id) {
    const id = randomUUID();
    await db.query(
      "INSERT INTO dining_tables(id,restaurant_id,number,capacity,zone,label,shape,bookable) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, r, a.number, a.capacity, a.zone, a.label, a.shape, a.bookable],
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
    "UPDATE dining_tables SET number=$3,capacity=$4,zone=$5,label=$6,shape=$7,bookable=$8,status=$9 WHERE id=$1 AND restaurant_id=$2",
    [
      a.id,
      r,
      a.number,
      a.capacity,
      a.zone,
      a.label,
      a.shape,
      a.bookable,
      t.status === "occupied" ? "occupied" : (a.status ?? t.status),
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
  requirePermission(user.role, "floor");
  await one(
    db,
    "UPDATE dining_tables SET pos_x=$3,pos_y=$4 WHERE id=$1 AND restaurant_id=$2 RETURNING id",
    [id, r, x, y],
  );
}

export async function tableLifecycle(
  db: DB,
  r: string,
  user: Actor,
  id: string,
  operation: "archive" | "restore" | "delete",
) {
  requirePermission(user.role, "floor");
  const t = await one<{ number: number; status: string }>(
    db,
    "SELECT number,status FROM dining_tables WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
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
  } else
    await db.query(
      `UPDATE dining_tables SET archived_at=${operation === "archive" ? "now()" : "NULL"} WHERE id=$1`,
      [id],
    );
  const verb = {
    archive: "archivée",
    restore: "restaurée",
    delete: "supprimée",
  };
  await log(db, r, user.id, `Table ${t.number} ${verb[operation]}`, id);
  await notify(db, r, `Plan de salle · table ${t.number} ${verb[operation]}`);
}
