import type { DB } from "@/lib/database/types";
import { appearanceSchema, defaultAppearance } from "./theme";
export async function readAppearance(db: DB, userId: string) {
  const { rows } = await db.query(
    `SELECT color,font,mode,text_size AS "textSize",category_colors AS "categoryColors" FROM profile_appearance WHERE profile_id=$1`,
    [userId],
  );
  return {
    userId,
    appearance: rows.length
      ? appearanceSchema.parse(rows[0])
      : defaultAppearance,
  };
}
export async function saveAppearance(db: DB, userId: string, raw: unknown) {
  const value = appearanceSchema.parse(raw);
  await db.query(
    `INSERT INTO profile_appearance(profile_id,color,font,mode,text_size,category_colors) VALUES($1,$2,$3,$4,$5,$6::jsonb)
    ON CONFLICT(profile_id) DO UPDATE SET color=excluded.color,font=excluded.font,mode=excluded.mode,text_size=excluded.text_size,category_colors=excluded.category_colors,updated_at=now()`,
    [
      userId,
      value.color,
      value.font,
      value.mode,
      value.textSize,
      JSON.stringify(value.categoryColors),
    ],
  );
  return { userId, appearance: value };
}
