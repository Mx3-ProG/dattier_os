import { z } from "zod";

/**
 * Services et Produits (Gestion). Pur : partagé par l'écran de gestion, l'API et le site public.
 * Les montants sont en centimes TTC.
 */
export const vatRates = [0, 2.1, 5.5, 10, 20] as const;
export const serviceLocations = { on_site: "Dans l’établissement", at_customer: "Chez le client", online: "En ligne" } as const;
export const deliveryModes = { pickup: "Retrait sur place", local_delivery: "Livraison locale", shipping: "Expédition" } as const;
export const stockModes = { none: "Pas de suivi de stock", own: "Quantité suivie ici", linked: "Relié à un article de Stocks & inventaire" } as const;
export const weekDays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:MM.");
export const availabilitySlot = z
  .object({ day: z.number().int().min(0).max(6), start: time, end: time })
  .strict()
  .refine((slot) => slot.end > slot.start, "La fin d’un créneau doit suivre son début.");
const vatRate = z.number().refine((rate) => vatRates.some((allowed) => allowed === rate), "Taux de TVA inconnu.");
const text = (max: number) => z.string().trim().max(max);
const cents = z.number().int().min(0).max(100_000_000);
/** Seules les images envoyées pour cet établissement sont acceptées (vérifié aussi côté serveur). */
const image = z.string().regex(/^\/api\/media\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}$/, "Image invalide.");

export const serviceInput = z
  .object({
    id: z.string().regex(/^[0-9a-f-]{36}$/).optional(),
    name: text(160).min(1, "Nom du service requis."),
    category: text(80),
    summary: text(280),
    description: text(5000),
    durationMinutes: z.number().int().min(5, "Durée minimale : 5 minutes.").max(1440),
    bufferMinutes: z.number().int().min(0).max(240),
    priceCents: cents,
    priceFrom: z.boolean(),
    vatRate: vatRate,
    capacity: z.number().int().min(1).max(500),
    location: z.enum(Object.keys(serviceLocations) as [keyof typeof serviceLocations]),
    availability: z.array(availabilitySlot).max(42),
    noticeHours: z.number().int().min(0).max(2160),
    images: z.array(image).max(8),
    published: z.boolean(),
  })
  .strict();
export type ServiceInput = z.infer<typeof serviceInput>;

export const productInput = z
  .object({
    id: z.string().regex(/^[0-9a-f-]{36}$/).optional(),
    name: text(160).min(1, "Nom du produit requis."),
    category: text(80),
    sku: text(64),
    summary: text(280),
    description: text(5000),
    priceCents: cents,
    compareAtCents: cents.nullable(),
    vatRate: vatRate,
    images: z.array(image).max(8),
    deliveryModes: z.array(z.enum(Object.keys(deliveryModes) as [keyof typeof deliveryModes])).min(1, "Choisissez au moins un mode de remise.").max(3),
    deliveryMinDays: z.number().int().min(0).max(365),
    deliveryMaxDays: z.number().int().min(0).max(365),
    shippingFeeCents: z.number().int().min(0).max(10_000_000),
    weightGrams: z.number().int().min(0).max(10_000_000).nullable(),
    stockMode: z.enum(Object.keys(stockModes) as [keyof typeof stockModes]),
    stockQuantity: z.number().int().min(0).max(10_000_000),
    stockThreshold: z.number().int().min(0).max(10_000_000),
    stockIngredientId: z.string().max(64).nullable(),
    published: z.boolean(),
    featured: z.boolean(),
  })
  .strict()
  .refine((value) => value.deliveryMaxDays >= value.deliveryMinDays, "Le délai maximal doit être supérieur ou égal au délai minimal.")
  .refine((value) => (value.stockMode === "linked") === !!value.stockIngredientId, "Choisissez l’article de stock relié.")
  .refine((value) => value.compareAtCents === null || value.compareAtCents > value.priceCents, "Le prix barré doit être supérieur au prix de vente.");
export type ProductInput = z.infer<typeof productInput>;

export const offersAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save-service"), service: serviceInput }).strict(),
  z.object({ action: z.literal("save-product"), product: productInput }).strict(),
  z.object({ action: z.literal("publish"), kind: z.enum(["service", "product"]), id: z.string().regex(/^[0-9a-f-]{36}$/), published: z.boolean() }).strict(),
  z.object({ action: z.literal("archive"), kind: z.enum(["service", "product"]), id: z.string().regex(/^[0-9a-f-]{36}$/) }).strict(),
  z.object({ action: z.literal("duplicate"), kind: z.enum(["service", "product"]), id: z.string().regex(/^[0-9a-f-]{36}$/) }).strict(),
  z.object({ action: z.literal("adjust-stock"), id: z.string().regex(/^[0-9a-f-]{36}$/), delta: z.number().int().min(-1_000_000).max(1_000_000) }).strict(),
]);
export type OffersAction = z.infer<typeof offersAction>;

export type Service = ServiceInput & { id: string; createdAt: string; updatedAt: string };
export type Product = ProductInput & {
  id: string;
  availability: "available" | "low" | "out";
  createdAt: string;
  updatedAt: string;
};
export type StockArticle = { id: string; name: string; unit: string; available: number };
export type OffersState = {
  services: Service[];
  products: Product[];
  stock: StockArticle[];
  canEdit: boolean;
  website: boolean;
};

/** Données publiées sur le site : jamais les quantités exactes ni les champs internes. */
export type PublicService = {
  id: string; name: string; category: string; summary: string; description: string;
  duration: number; price: number; priceFrom: boolean; capacity: number;
  location: keyof typeof serviceLocations;
  availability: { day: number; start: string; end: string }[];
  noticeHours: number; images: string[];
};
export type PublicProduct = {
  id: string; name: string; category: string; summary: string; description: string;
  price: number; compareAt: number | null; images: string[];
  deliveryModes: (keyof typeof deliveryModes)[]; deliveryMin: number; deliveryMax: number;
  shippingFee: number; featured: boolean; availability: "available" | "low" | "out";
};
export type PublicOffers = { services: PublicService[]; products: PublicProduct[] };
export const emptyOffers: PublicOffers = { services: [], products: [] };
export function parsePublicOffers(raw: unknown): PublicOffers {
  if (!raw || typeof raw !== "object") return emptyOffers;
  const value = raw as Partial<PublicOffers>;
  return {
    services: Array.isArray(value.services) ? value.services : [],
    products: Array.isArray(value.products) ? value.products : [],
  };
}

export const euro = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
export function duration(minutes: number) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}
export function deliveryDelay(min: number, max: number) {
  if (max === 0) return "Disponible immédiatement";
  if (min === max) return `Sous ${max} jour${max > 1 ? "s" : ""}`;
  return `Sous ${min} à ${max} jours`;
}
/** Créneaux regroupés par jour, du lundi au dimanche. */
export function availabilitySummary(slots: readonly { day: number; start: string; end: string }[]) {
  return [1, 2, 3, 4, 5, 6, 0]
    .map((day) => ({ day, slots: slots.filter((slot) => slot.day === day).sort((a, b) => a.start.localeCompare(b.start)) }))
    .filter((entry) => entry.slots.length > 0)
    .map((entry) => `${weekDays[entry.day]} ${entry.slots.map((slot) => `${slot.start.replace(":", " h ")}–${slot.end.replace(":", " h ")}`).join(", ")}`);
}
