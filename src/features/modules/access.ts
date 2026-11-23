import type { DB } from "@/infrastructure/database/types";

export type ActiveModule = "floor" | "table-booking";
export async function moduleEnabled(
  db: DB,
  restaurant: string,
  module: ActiveModule,
) {
  const { rows } = await db.query<{ allowed: boolean }>(
    "SELECT app.module_enabled($1::text,$2::text) AS allowed",
    [restaurant, module],
  );
  return rows[0]?.allowed === true;
}
export async function requireModule(
  db: DB,
  restaurant: string,
  module: ActiveModule,
) {
  if (!(await moduleEnabled(db, restaurant, module)))
    throw new Error("Ce module est suspendu pour cet établissement.");
}
