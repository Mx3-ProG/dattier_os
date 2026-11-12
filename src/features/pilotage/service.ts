import { z } from "zod";
import type { DB } from "@/infrastructure/database/types";
import { scope, type Actor } from "@/infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { pilotageWidgets, type PilotageWidgetId } from "./catalog";
const ids = new Set<string>(pilotageWidgets.map((w) => w.id));
export const pilotageSaveSchema = z
  .object({
    hidden: z.array(z.string().refine((id) => ids.has(id))).max(40),
    revision: z.number().int().min(0).max(2147483646),
  })
  .strict();
export type PilotagePreferences = {
  userId: string;
  restaurant: string;
  hidden: PilotageWidgetId[];
  revision: number;
};
async function access(db: DB, user: Actor, restaurant: string) {
  const scoped = await scope(db, user, restaurant);
  requirePermission(scoped.roles ?? scoped.role, "finance");
}
export async function readPilotage(
  db: DB,
  user: Actor,
  restaurant: string,
): Promise<PilotagePreferences> {
  await access(db, user, restaurant);
  const { rows } = await db.query<{
    hidden: PilotageWidgetId[];
    revision: number;
  }>(
    "SELECT hidden,revision FROM pilotage_preferences WHERE restaurant_id=$1 AND profile_id=$2",
    [restaurant, user.id],
  );
  return {
    userId: user.id,
    restaurant,
    hidden: rows[0]?.hidden ?? [],
    revision: rows[0]?.revision ?? 0,
  };
}
export async function savePilotage(
  db: DB,
  user: Actor,
  restaurant: string,
  raw: unknown,
): Promise<PilotagePreferences> {
  await access(db, user, restaurant);
  const value = pilotageSaveSchema.parse(raw);
  const hidden = [...new Set(value.hidden)];
  const result =
    value.revision === 0
      ? await db.query(
          `INSERT INTO pilotage_preferences(restaurant_id,profile_id,hidden) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING revision`,
          [restaurant, user.id, hidden],
        )
      : await db.query(
          `UPDATE pilotage_preferences SET hidden=$3,revision=revision+1,updated_at=now() WHERE restaurant_id=$1 AND profile_id=$2 AND revision=$4 RETURNING revision`,
          [restaurant, user.id, hidden, value.revision],
        );
  if (!result.rows.length)
    throw new Error(
      "Vos préférences ont été modifiées ailleurs. Rechargez-les avant de réessayer.",
    );
  return {
    userId: user.id,
    restaurant,
    hidden: hidden as PilotageWidgetId[],
    revision: Number(result.rows[0].revision),
  };
}
