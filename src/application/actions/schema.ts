import { z } from "zod";
import { productSchema } from "@/features/catalog/service";
import { promoSchema } from "@/features/loyalty/service";
import {
  engagementSettingsSchema,
  flashSchema,
  stopFlashSchema,
} from "@/features/commerce/engagement";
import { tableSchema, zoneSchemas } from "@/features/floor/service";
import { messageSchema } from "@/features/messaging/service";
import { orderSchema } from "@/features/orders/service";

const text = z.string().trim().min(1).max(300),
  qty = z.coerce.number().positive().max(1000000),
  id = z.string().min(1),
  dt = z.string().datetime();

export const actionSchema = z.discriminatedUnion("action", [
  productSchema,
  promoSchema,
  engagementSettingsSchema,
  flashSchema,
  stopFlashSchema,
  messageSchema,
  z.object({
    action: z.literal("productLifecycle"),
    id,
    operation: z.enum(["archive", "restore", "delete"]),
  }),
  z.object({ action: z.literal("cancelPromo"), id }),
  z.object({ action: z.literal("order"), data: orderSchema }),
  z.object({
    action: z.literal("item"),
    id,
    status: z.enum(["preparing", "ready", "served", "cancelled"]),
  }),
  z.object({
    action: z.literal("pay"),
    id,
    method: z.enum(["card", "cash", "other"]),
    customer: z.string().optional(),
    promo: z.string().max(40).optional(),
  }),
  z.object({ action: z.literal("confirmOrder"), id, accept: z.boolean() }),
  z.object({
    action: z.literal("table"),
    id,
    status: z.enum(["free", "cleaning", "unavailable"]),
  }),
  tableSchema,
  ...zoneSchemas,
  z.object({
    action: z.literal("moveTable"),
    id,
    x: z.coerce.number().int().min(0).max(100),
    y: z.coerce.number().int().min(0).max(100),
  }),
  z.object({
    action: z.literal("tableLifecycle"),
    id,
    operation: z.enum(["archive", "restore", "delete"]),
  }),
  z.object({
    action: z.literal("reservation"),
    id,
    status: z.enum([
      "confirmed",
      "arrived",
      "declined",
      "cancelled",
      "no_show",
    ]),
    table: id.optional(),
  }),
  z.object({
    action: z.literal("stock"),
    id,
    quantity: z.coerce.number().min(0).max(1000000),
    reason: text,
    kind: z.enum(["waste", "inventory"]),
  }),
  z.object({
    action: z.literal("supplier"),
    name: text,
    contact: text,
    ingredients: z.array(id).max(50).default([]),
  }),
  z.object({
    action: z.literal("supplierIngredient"),
    supplier: id,
    ingredient: id,
    linked: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("ingredient"),
    name: text,
    unit: z.enum(["g", "ml", "unit"]),
    threshold: z.coerce.number().min(0).max(1000000).default(0),
    cost: z.coerce.number().min(0).max(1000000).default(0),
  }),
  z.object({
    action: z.literal("purchase"),
    supplier: id,
    ingredient: id,
    quantity: qty,
    due: z.string().date(),
  }),
  z.object({
    action: z.literal("receive"),
    id,
    quantity: qty,
    expires: z.string().date(),
  }),
  z.object({ action: z.literal("shift"), profile: id, start: dt, end: dt }),
  z.object({ action: z.literal("deleteShift"), id }),
  z.object({
    action: z.literal("clock"),
    event: z.enum(["start", "break", "resume", "end"]),
  }),
  z.object({
    action: z.literal("expense"),
    label: text,
    amount: z.coerce.number().int().positive(),
  }),
  z.object({
    action: z.literal("customer"),
    name: text,
    contact: text,
    consent: z.boolean(),
  }),
  z.object({
    action: z.literal("loyalty"),
    id,
    points: z.coerce.number().int().min(-10000).max(10000),
    reason: text,
  }),
  z.object({
    action: z.literal("menu"),
    id,
    name: text,
    price: z.coerce.number().int().min(0),
    enabled: z.boolean(),
    description: z.string().max(500),
    public_composition: z.string().trim().max(2000).optional(),
    allergens: z.string().trim().max(500).optional(),
    seo_title: z.string().trim().max(80).optional(),
    seo_description: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal("recipe"),
    menu: id,
    ingredient: id,
    quantity: qty,
  }),
  z.object({ action: z.literal("read") }),
  z.object({
    action: z.literal("restaurant"),
    name: text,
    address: text,
    phone: z.string().max(50),
    goal: z.coerce.number().int().positive(),
  }),
  z.object({ action: z.literal("addRestaurant"), name: text }),
]);
