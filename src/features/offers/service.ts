import { randomUUID } from "node:crypto";
import { one, rows, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log } from "@/features/orders/service";
import {
  offersAction,
  parsePublicOffers,
  type OffersState,
  type Product,
  type ProductInput,
  type Service,
  type ServiceInput,
} from "./model";

type ServiceRow = {
  id: string; name: string; category: string; summary: string; description: string;
  duration_minutes: number; buffer_minutes: number; price_cents: number; price_from: boolean;
  vat_rate: string; capacity: number; location: Service["location"]; availability: Service["availability"];
  notice_hours: number; images: string[]; published: boolean; created_at: string; updated_at: string;
};
type ProductRow = {
  id: string; name: string; category: string; sku: string; summary: string; description: string;
  price_cents: number; compare_at_cents: number | null; vat_rate: string; images: string[];
  delivery_modes: Product["deliveryModes"]; delivery_min_days: number; delivery_max_days: number;
  shipping_fee_cents: number; weight_grams: number | null; stock_mode: Product["stockMode"];
  stock_quantity: number; stock_threshold: number; stock_ingredient_id: string | null;
  published: boolean; featured: boolean; availability: Product["availability"] | null;
  created_at: string; updated_at: string;
};

const toService = (row: ServiceRow): Service => ({
  id: row.id, name: row.name, category: row.category, summary: row.summary, description: row.description,
  durationMinutes: row.duration_minutes, bufferMinutes: row.buffer_minutes, priceCents: row.price_cents,
  priceFrom: row.price_from, vatRate: Number(row.vat_rate), capacity: row.capacity, location: row.location,
  availability: row.availability, noticeHours: row.notice_hours, images: row.images, published: row.published,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
const toProduct = (row: ProductRow): Product => ({
  id: row.id, name: row.name, category: row.category, sku: row.sku, summary: row.summary,
  description: row.description, priceCents: row.price_cents, compareAtCents: row.compare_at_cents,
  vatRate: Number(row.vat_rate), images: row.images, deliveryModes: row.delivery_modes,
  deliveryMinDays: row.delivery_min_days, deliveryMaxDays: row.delivery_max_days,
  shippingFeeCents: row.shipping_fee_cents, weightGrams: row.weight_grams, stockMode: row.stock_mode,
  stockQuantity: row.stock_quantity, stockThreshold: row.stock_threshold,
  stockIngredientId: row.stock_ingredient_id, published: row.published, featured: row.featured,
  availability: row.availability ?? "available", createdAt: row.created_at, updatedAt: row.updated_at,
});

/** Lecture et écriture réservées aux profils qui gèrent la carte et le catalogue. */
async function member(db: DB, user: Actor, restaurant: string) {
  const scoped = await scope(db, user, restaurant);
  requirePermission(scoped.roles ?? scoped.role, "catalog");
  return scoped;
}

/** Une image n'est acceptée que si elle a été envoyée pour cet établissement. */
async function checkImages(db: DB, restaurant: string, images: readonly string[]) {
  const prefix = `/api/media/${restaurant}/`;
  const ids = images.map((url) => {
    if (!url.startsWith(prefix)) throw new Error("Image d’un autre établissement refusée.");
    return url.slice(prefix.length);
  });
  if (!ids.length) return;
  const found = await rows<{ id: string }>(db, "SELECT id FROM site_assets WHERE restaurant_id=$1 AND id=ANY($2::text[])", [restaurant, ids]);
  if (found.length !== new Set(ids).size) throw new Error("Image introuvable : envoyez-la de nouveau.");
}

export async function offersState(db: DB, user: Actor, restaurant: string): Promise<OffersState> {
  await member(db, user, restaurant);
  const services = await rows<ServiceRow>(db,
    `SELECT id,name,category,summary,description,duration_minutes,buffer_minutes,price_cents,price_from,vat_rate::text,
       capacity,location,availability,notice_hours,images,published,created_at,updated_at
     FROM business_services WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY position,created_at`, [restaurant]);
  const products = await rows<ProductRow>(db,
    `SELECT p.id,p.name,p.category,p.sku,p.summary,p.description,p.price_cents,p.compare_at_cents,p.vat_rate::text,p.images,
       p.delivery_modes,p.delivery_min_days,p.delivery_max_days,p.shipping_fee_cents,p.weight_grams,p.stock_mode,
       p.stock_quantity,p.stock_threshold,p.stock_ingredient_id,p.published,p.featured,
       app.product_availability(p) AS availability,p.created_at,p.updated_at
     FROM business_products p WHERE p.restaurant_id=$1 AND p.archived_at IS NULL ORDER BY p.position,p.created_at`, [restaurant]);
  const stock = await rows<{ id: string; name: string; unit: string; available: string }>(db,
    `SELECT i.id,i.name,i.unit,coalesce(sum(l.quantity-l.reserved) FILTER (WHERE l.expires_on>=current_date),0)::text AS available
     FROM ingredients i LEFT JOIN stock_lots l ON l.ingredient_id=i.id
     WHERE i.restaurant_id=$1 GROUP BY i.id ORDER BY i.name`, [restaurant]);
  const website = await one<{ installed: boolean }>(db, "SELECT app.addon_installed($1,'website') AS installed", [restaurant]);
  return {
    services: services.map(toService),
    products: products.map(toProduct),
    stock: stock.map((entry) => ({ ...entry, available: Number(entry.available) })),
    canEdit: true,
    website: website.installed,
  };
}

async function saveService(db: DB, restaurant: string, actor: string, input: ServiceInput) {
  await checkImages(db, restaurant, input.images);
  const values = [
    input.name, input.category, input.summary, input.description, input.durationMinutes, input.bufferMinutes,
    input.priceCents, input.priceFrom, input.vatRate, input.capacity, input.location,
    JSON.stringify(input.availability), input.noticeHours, JSON.stringify(input.images), input.published,
  ];
  if (input.id) {
    const updated = await db.query(
      `UPDATE business_services SET name=$3,category=$4,summary=$5,description=$6,duration_minutes=$7,buffer_minutes=$8,
         price_cents=$9,price_from=$10,vat_rate=$11,capacity=$12,location=$13,availability=$14::jsonb,notice_hours=$15,
         images=$16::jsonb,published=$17,updated_at=now()
       WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL RETURNING id`, [input.id, restaurant, ...values]);
    if (!updated.rows.length) throw new Error("Service introuvable.");
    await log(db, restaurant, actor, `Service modifié : ${input.name}`, input.id);
    return input.id;
  }
  const id = randomUUID();
  await db.query(
    `INSERT INTO business_services(id,restaurant_id,name,category,summary,description,duration_minutes,buffer_minutes,
       price_cents,price_from,vat_rate,capacity,location,availability,notice_hours,images,published,created_by,position)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17,$18,
       (SELECT coalesce(max(position),0)+1 FROM business_services WHERE restaurant_id=$2))`,
    [id, restaurant, ...values, actor]);
  await log(db, restaurant, actor, `Service créé : ${input.name}`, id);
  return id;
}

async function saveProduct(db: DB, restaurant: string, actor: string, input: ProductInput) {
  await checkImages(db, restaurant, input.images);
  const values = [
    input.name, input.category, input.sku, input.summary, input.description, input.priceCents, input.compareAtCents,
    input.vatRate, JSON.stringify(input.images), input.deliveryModes, input.deliveryMinDays, input.deliveryMaxDays,
    input.shippingFeeCents, input.weightGrams, input.stockMode, input.stockQuantity, input.stockThreshold,
    input.stockMode === "linked" ? input.stockIngredientId : null, input.published, input.featured,
  ];
  if (input.id) {
    const updated = await db.query(
      `UPDATE business_products SET name=$3,category=$4,sku=$5,summary=$6,description=$7,price_cents=$8,compare_at_cents=$9,
         vat_rate=$10,images=$11::jsonb,delivery_modes=$12::text[],delivery_min_days=$13,delivery_max_days=$14,
         shipping_fee_cents=$15,weight_grams=$16,stock_mode=$17,stock_quantity=$18,stock_threshold=$19,
         stock_ingredient_id=$20,published=$21,featured=$22,updated_at=now()
       WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL RETURNING id`, [input.id, restaurant, ...values]);
    if (!updated.rows.length) throw new Error("Produit introuvable.");
    await log(db, restaurant, actor, `Produit modifié : ${input.name}`, input.id);
    return input.id;
  }
  const id = randomUUID();
  await db.query(
    `INSERT INTO business_products(id,restaurant_id,name,category,sku,summary,description,price_cents,compare_at_cents,
       vat_rate,images,delivery_modes,delivery_min_days,delivery_max_days,shipping_fee_cents,weight_grams,stock_mode,
       stock_quantity,stock_threshold,stock_ingredient_id,published,featured,created_by,position)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::text[],$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
       (SELECT coalesce(max(position),0)+1 FROM business_products WHERE restaurant_id=$2))`,
    [id, restaurant, ...values, actor]);
  await log(db, restaurant, actor, `Produit créé : ${input.name}`, id);
  return id;
}

const tables = { service: "business_services", product: "business_products" } as const;
const labels = { service: "Service", product: "Produit" } as const;

export async function offersMutation(db: DB, user: Actor, restaurant: string, raw: unknown) {
  const body = offersAction.parse(raw);
  const scoped = await member(db, user, restaurant);
  switch (body.action) {
    case "save-service":
      await saveService(db, restaurant, scoped.id, body.service);
      break;
    case "save-product":
      await saveProduct(db, restaurant, scoped.id, body.product);
      break;
    case "publish": {
      const result = await db.query(
        `UPDATE ${tables[body.kind]} SET published=$3,updated_at=now() WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL RETURNING id`,
        [body.id, restaurant, body.published]);
      if (!result.rows.length) throw new Error(`${labels[body.kind]} introuvable.`);
      await log(db, restaurant, scoped.id, `${labels[body.kind]} ${body.published ? "affiché sur le site" : "retiré du site"}`, body.id);
      break;
    }
    case "archive": {
      const result = await db.query(
        `UPDATE ${tables[body.kind]} SET archived_at=now(),published=false,updated_at=now() WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL RETURNING id`,
        [body.id, restaurant]);
      if (!result.rows.length) throw new Error(`${labels[body.kind]} introuvable.`);
      await log(db, restaurant, scoped.id, `${labels[body.kind]} supprimé`, body.id);
      break;
    }
    case "duplicate": {
      const id = randomUUID();
      const columns = body.kind === "service"
        ? "name,category,summary,description,duration_minutes,buffer_minutes,price_cents,price_from,vat_rate,capacity,location,availability,notice_hours,images"
        : "name,category,sku,summary,description,price_cents,compare_at_cents,vat_rate,images,delivery_modes,delivery_min_days,delivery_max_days,shipping_fee_cents,weight_grams,stock_mode,stock_quantity,stock_threshold,stock_ingredient_id";
      const copied = columns.split(",").map((column) => column === "name" ? "left(name,150)||' (copie)'" : column === "sku" ? "''" : column).join(",");
      const result = await db.query(
        `INSERT INTO ${tables[body.kind]}(id,restaurant_id,${columns},published,created_by,position)
         SELECT $3,restaurant_id,${copied},false,$4,position FROM ${tables[body.kind]}
         WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL RETURNING id`,
        [body.id, restaurant, id, scoped.id]);
      if (!result.rows.length) throw new Error(`${labels[body.kind]} introuvable.`);
      await log(db, restaurant, scoped.id, `${labels[body.kind]} dupliqué`, id);
      break;
    }
    case "adjust-stock": {
      const result = await db.query(
        `UPDATE business_products SET stock_quantity=greatest(0,stock_quantity+$3),updated_at=now()
         WHERE id=$1 AND restaurant_id=$2 AND stock_mode='own' AND archived_at IS NULL RETURNING id`,
        [body.id, restaurant, body.delta]);
      if (!result.rows.length) throw new Error("Ce produit ne suit pas sa propre quantité.");
      await log(db, restaurant, scoped.id, `Stock produit ajusté (${body.delta > 0 ? "+" : ""}${body.delta})`, body.id);
      break;
    }
  }
  return offersState(db, user, restaurant);
}

/** Services et produits publiés, lus dans le contexte public du site. */
export async function publicOffers(db: DB, restaurant: string) {
  // Déploiement avant `npm run db:migrate` (migration 151) : le site s'affiche sans ces sections.
  const ready = await one<{ ok: boolean }>(db, "SELECT to_regprocedure('app.public_offers(text)') IS NOT NULL AS ok");
  if (!ready.ok) return parsePublicOffers(null);
  const result = await one<{ data: unknown }>(db, "SELECT app.public_offers($1) AS data", [restaurant]);
  return parsePublicOffers(result.data);
}
