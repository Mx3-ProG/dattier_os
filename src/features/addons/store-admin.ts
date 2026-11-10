import { z } from "zod";
import { isLoadingRenderer, loadingScreenKind } from "./loading-screens";
import { analyticsKind, isAnalyticsRenderer } from "@/features/analytics/modules";
import { withBusinessErrors } from "./store-service";
import { authenticated } from "@/features/platform/http";
import { rows, type DB } from "@/lib/database/db";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const categorySchema = z
  .object({
    id: slug,
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500),
    position: z.number().int().min(0).max(100000),
    visible: z.boolean(),
  })
  .strict();
const productSchema = z
  .object({
    id: slug,
    categoryId: slug,
    kind: z.enum([loadingScreenKind, analyticsKind]),
    renderer: z.string(),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500),
    // L’abonnement n’est pas ouvert à la vente : la colonne le prévoit pour de futurs types d’add-ons.
    pricingMode: z.enum(["free", "one_time"]),
    priceCents: z.number().int().min(0).max(1_000_000),
    sellable: z.boolean(),
    listed: z.boolean(),
    version: z.string().trim().min(1).max(20),
    position: z.number().int().min(0).max(100000),
  })
  .strict()
  .refine(
    (value) => (value.kind === analyticsKind ? isAnalyticsRenderer(value.renderer) : isLoadingRenderer(value.renderer)),
    "Moteur de rendu inconnu.",
  )
  .refine(
    (value) => (value.pricingMode === "free" ? value.priceCents === 0 : value.priceCents >= 50),
    "Un add-on gratuit coûte 0 € ; un paiement unique coûte au moins 0,50 €.",
  );
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveCategory"), category: categorySchema }),
  z.object({ action: z.literal("deleteCategory"), id: slug }),
  z.object({ action: z.literal("saveProduct"), product: productSchema }),
]);

async function readAdmin(db: DB) {
  // Le contrôle du rôle est porté par les fonctions SQL : appelées en premier, elles refusent tout le reste.
  const stats = await rows(db, "SELECT * FROM app.addon_admin_stats()");
  return {
    stats: stats.map((row) => {
      const value = row as Record<string, unknown>;
      return { ...value, revenue_cents: Number(value.revenue_cents) };
    }),
    purchases: await rows(db, "SELECT * FROM app.addon_admin_purchases(50)"),
    categories: await rows(db, "SELECT id,name,description,position,visible FROM addon_categories ORDER BY position,name"),
    products: await rows(
      db,
      "SELECT id,category_id,kind,renderer,name,description,pricing_mode,price_cents,sellable,listed,version,position FROM addon_products ORDER BY position,name",
    ),
  };
}
export const addonAdminState = () =>
  withBusinessErrors(() => authenticated(undefined, (db) => readAdmin(db)));
export async function addonAdminPerform(input: unknown) {
  const body = actionSchema.parse(input);
  return withBusinessErrors(() =>
    authenticated(undefined, async (db) => {
      if (body.action === "saveCategory")
        await db.query("SELECT app.addon_admin_save_category($1::jsonb)", [JSON.stringify(body.category)]);
      else if (body.action === "deleteCategory")
        await db.query("SELECT app.addon_admin_delete_category($1)", [body.id]);
      else await db.query("SELECT app.addon_admin_save_product($1::jsonb)", [JSON.stringify(body.product)]);
      return readAdmin(db);
    }),
  );
}
