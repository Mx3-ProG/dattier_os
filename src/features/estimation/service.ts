import { authenticated } from "@/features/platform/http";
import { scope } from "@/infrastructure/auth/session";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { estimationSaveSchema, type EstimationItem } from "@/domain/estimation/model";

type Config = {
  title: string;
  introduction: string;
  items: EstimationItem[];
  fixed_costs_cents: number;
  published: boolean;
  revision: number;
};
async function state(db: DB, restaurant: string) {
  const { allowed } = await one<{ allowed: boolean }>(db,
    "SELECT app.addon_store_manager($1) AND app.addon_installed($1,'estimation-studio') AS allowed", [restaurant]);
  if (!allowed) throw new Error("Add-on Estimation non installé ou accès réservé au super admin.");
  const config = (await rows<Config>(db,
    "SELECT title,introduction,items,fixed_costs_cents,published,revision FROM estimation_configs WHERE restaurant_id=$1", [restaurant]))[0];
  const menu = await rows<{ id: string; name: string; price_cents: number; cost_cents: number | null }>(db,
    `SELECT m.id,m.name,m.price AS price_cents,
      round(sum(ri.quantity*i.cost)*100)::int AS cost_cents
      FROM menu_items m LEFT JOIN recipe_ingredients ri ON ri.menu_id=m.id
      LEFT JOIN ingredients i ON i.id=ri.ingredient_id
      WHERE m.restaurant_id=$1 AND m.enabled AND m.archived_at IS NULL
      GROUP BY m.id,m.name,m.price ORDER BY m.name LIMIT 100`, [restaurant]);
  const websiteAvailable = (await one<{ allowed: boolean }>(db,
    "SELECT app.addon_installed($1,'website') AS allowed", [restaurant])).allowed;
  return { config: config ?? {
    title: "Estimez votre projet", introduction: "Choisissez les produits ou services qui vous intéressent.",
    items: [], fixed_costs_cents: 0, published: false, revision: 0,
  }, menu, websiteAvailable, publicPath: `/r/${encodeURIComponent(restaurant)}/estimation` };
}
export const estimationState = (restaurant: string) => authenticated(restaurant, async (db, user) => {
  await scope(db, user, restaurant);
  return state(db, restaurant);
});
export async function saveEstimation(restaurant: string, raw: unknown) {
  const value = estimationSaveSchema.parse(raw);
  return authenticated(restaurant, async (db, user) => {
    await scope(db, user, restaurant);
    if (value.published) {
      const { allowed } = await one<{ allowed: boolean }>(db,
        "SELECT app.addon_installed($1,'website') AS allowed", [restaurant]);
      if (!allowed) throw new Error("Installez le site web avant de publier le simulateur.");
    }
    await db.query("SELECT app.estimation_save($1,$2,$3,$4::jsonb,$5,$6,$7)", [
      restaurant, value.title, value.introduction, JSON.stringify(value.items),
      value.fixedCostsCents, value.published, value.revision,
    ]);
    return state(db, restaurant);
  });
}
