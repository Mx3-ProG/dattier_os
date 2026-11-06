import type { ProductPageFields } from "@/lib/product-pages";
import { z } from "zod";
const publicUrlSchema = z.union([
  z
    .string()
    .url()
    .max(1000)
    .refine((value) => value.startsWith("https://"), {
      message: "Le lien doit utiliser HTTPS.",
    }),
  z.literal(""),
]);
export const optionSchema = z.object({
  id: z.string().min(1).max(50),
  label: z.string().trim().min(1).max(100),
  required: z.boolean(),
  multiple: z.boolean(),
  choices: z
    .array(
      z.object({
        id: z.string().min(1).max(50),
        label: z.string().trim().min(1).max(100),
        price: z.number().int().min(0).max(10000),
      }),
    )
    .min(1)
    .max(20),
});
export type Option = z.infer<typeof optionSchema>;
export const settingsSchema = z
  .object({
    open: z.boolean(),
    prepMinutes: z.number().int().min(5).max(180),
    interval: z.number().int().min(5).max(60),
    capacity: z.number().int().min(1).max(100),
    hours: z
      .array(
        z.object({
          day: z.number().int().min(0).max(6),
          open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        }),
      )
      .max(42),
    categories: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
    address: z.string().max(300),
    phone: z.string().max(80),
    logo: z.string().max(300),
    googleBusinessUrl: publicUrlSchema.default(""),
    googleReviewUrl: publicUrlSchema.default(""),
  })
  .superRefine((s, c) => {
    if (s.hours.some((h) => h.close <= h.open))
      c.addIssue({
        code: "custom",
        message: "La fermeture doit suivre l’ouverture.",
      });
    for (let day = 0; day < 7; day++) {
      const periods = s.hours
        .filter((hour) => hour.day === day)
        .toSorted((a, b) => a.open.localeCompare(b.open));
      if (
        periods.some(
          (period, index) =>
            index > 0 && period.open < periods[index - 1].close,
        )
      )
        c.addIssue({
          code: "custom",
          path: ["hours"],
          message:
            "Les plages d’une même journée ne peuvent pas se chevaucher.",
        });
    }
    if (new Set(s.categories).size !== s.categories.length)
      c.addIssue({ code: "custom", message: "Catégories en double." });
  });
export type Settings = z.infer<typeof settingsSchema>;
export const checkoutSchema = z.object({
  key: z.string().uuid(),
  customer: z.string().trim().min(2).max(100),
  email: z.string().email().max(150),
  consumption: z.enum(["onsite", "takeaway"]),
  payment: z.enum(["counter", "stripe"]),
  promo: z.string().trim().max(40).optional().default(""),
  loyaltyConsent: z.boolean().default(false),
  termsAccepted: z.literal(true, {
    error: "Vous devez accepter les CGV avant de commander.",
  }),
  accountToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  slot: z.string().datetime(),
  items: z
    .array(
      z.object({
        menu: z.string().max(100),
        quantity: z.number().int().min(1).max(20),
        choices: z.array(z.string().max(101)).max(30),
        note: z.string().max(300).default(""),
      }),
    )
    .min(1)
    .max(30),
});
export type Checkout = z.infer<typeof checkoutSchema>;
export type Product = ProductPageFields & {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  images: string[];
  allergens: string;
  options: Option[];
  enabled: boolean;
  portions: number;
};
export type PublicReview = {
  id: string;
  menu_id: string;
  menu_name: string;
  customer_name: string;
  rating: number;
  body: string;
  admin_reply: string;
  created_at: string;
  verified_purchase: boolean;
};
export const reviewSubmissionSchema = z.object({
  menu: z.string().min(1).max(100),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(10).max(1000),
});
export type ShopOrder = {
  order_id: string;
  number: number;
  token: string;
  consumption: string;
  payment_method: string;
  payment_status: string;
  total: number;
  subtotal: number;
  discount: number;
  points_awarded: number;
  status: string;
  desired_at: string;
  created_at: string;
  customer_name: string;
  email_preview: string;
  stripe_session: string | null;
  stripe_url: string | null;
  reorder_items: {
    menu: string;
    quantity: number;
    choices: string[];
    note: string;
  }[];
  customer_access_token?: string;
  items: {
    id: string;
    menu_id: string;
    name: string;
    price: number;
    quantity: number;
    note: string;
    status: string;
    station: string;
  }[];
};
export type CustomerAccount = {
  customer: {
    name: string;
    email: string;
    points: number;
    loyaltyConsent: boolean;
  };
  rewards: {
    id: string;
    name: string;
    points_cost: number;
    kind: string;
  }[];
  orders: ShopOrder[];
};
export function preparation(o: ShopOrder) {
  if (o.status === "cancelled") return "cancelled";
  const items = o.items.filter((i) => i.status !== "cancelled");
  if (items.length && items.every((i) => i.status === "served"))
    return "served";
  if (
    items.length &&
    items.every((i) => ["ready", "served"].includes(i.status))
  )
    return "ready";
  if (items.some((i) => i.status !== "waiting")) return "preparing";
  return "waiting";
}
