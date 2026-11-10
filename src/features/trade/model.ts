import { z } from "zod";
import type { TradeEntity, TradeField } from "./definitions";

export const vatRates = [0, 5.5, 10, 20] as const;
export type QuoteLine = { label: string; quantity: number; unit: string; unitPrice: number; vat: number };
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const clean = (max: number) =>
  z.string().trim().max(max).regex(/^[^\p{Cc}]*$/u, "Caractères non autorisés.");
const multiline = (max: number) =>
  z.string().trim().max(max).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/, "Caractères non autorisés.");

function fieldSchema(field: TradeField): z.ZodType {
  const min = field.min ?? 0;
  const max = field.max ?? 1_000_000;
  switch (field.type) {
    case "text":
      return clean(200);
    case "textarea":
      return multiline(3000);
    case "number":
      return z.number().finite().min(min).max(max);
    case "percent":
      return z.number().finite().min(field.min ?? 0).max(field.max ?? 100);
    case "money":
      // Centimes entiers : pas d’arrondi flottant sur les montants.
      return z.number().int().min(0).max(100_000_000);
    case "date":
      return z.string().regex(isoDate).refine((value) => !Number.isNaN(Date.parse(value)), "Date invalide.");
    case "datetime":
      return z.string().max(40).refine((value) => !Number.isNaN(Date.parse(value)), "Date invalide.");
    case "select":
      return field.options ? z.enum(field.options as [string, ...string[]]) : clean(100).min(1);
    case "multiselect":
      return z.array(clean(100).min(1)).max(30);
    case "boolean":
      return z.boolean();
    case "ref":
      return z.string().uuid();
    case "lines":
      return z
        .array(
          z.object({
            label: clean(200).min(1),
            quantity: z.number().finite().min(0).max(1_000_000),
            unit: clean(20),
            unitPrice: z.number().int().min(0).max(100_000_000),
            vat: z.union(vatRates.map((rate) => z.literal(rate)) as [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]),
          }).strict(),
        )
        .max(100);
  }
}
const empty = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
/** Valide une fiche selon sa définition : champs connus uniquement, obligatoires présents. */
export function parseTradeData(entity: TradeEntity, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Fiche invalide.");
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input))
    if (!entity.fields.some((field) => field.key === key)) throw new Error(`Champ inconnu : ${key}.`);
  const output: Record<string, unknown> = {};
  for (const field of entity.fields) {
    const value = input[field.key];
    if (empty(value)) {
      if (field.required) throw new Error(`« ${field.label} » est obligatoire.`);
      continue;
    }
    const parsed = fieldSchema(field).safeParse(value);
    if (!parsed.success) throw new Error(`« ${field.label} » est invalide.`);
    output[field.key] = parsed.data;
  }
  return output;
}
export function quoteTotals(lines: readonly QuoteLine[]) {
  let net = 0;
  let vat = 0;
  for (const line of lines) {
    const amount = Math.round(line.quantity * line.unitPrice);
    net += amount;
    vat += Math.round((amount * line.vat) / 100);
  }
  return { net, vat, gross: net + vat };
}
/** Indique si deux créneaux [début, début + durée) se chevauchent. */
export function overlaps(aStart: number, aMinutes: number, bStart: number, bMinutes: number) {
  return aStart < bStart + bMinutes * 60_000 && bStart < aStart + aMinutes * 60_000;
}
export function postcodeMatches(prefixes: string, postcode: string) {
  const code = postcode.replace(/\s/g, "");
  return prefixes
    .split(",")
    .map((prefix) => prefix.trim())
    .some((prefix) => prefix.length > 0 && code.startsWith(prefix));
}
export function shippingQuote(
  zones: readonly { name: string; postcodes: string; fee: number; freeAbove?: number; delay?: number; mode: string }[],
  postcode: string,
  cartCents: number,
) {
  const zone = zones.find((entry) => postcodeMatches(entry.postcodes, postcode));
  if (!zone) return null;
  const free = zone.freeAbove !== undefined && zone.freeAbove > 0 && cartCents >= zone.freeAbove;
  return { zone: zone.name, mode: zone.mode, fee: free ? 0 : zone.fee, delay: zone.delay ?? null, free };
}
/** Segments automatiques, du plus engagé au moins engagé. */
export type CustomerStats = { id: string; name: string; contact: string; orders: number; spend: number; points: number; lastOrder: string | null; firstOrder: string | null };
export const builtinSegments = ["Fidèles", "Nouveaux", "À risque", "Inactifs", "Sans commande"] as const;
export function builtinSegment(customer: CustomerStats, now = Date.now()): (typeof builtinSegments)[number] {
  if (!customer.lastOrder || customer.orders === 0) return "Sans commande";
  const sinceLast = (now - Date.parse(customer.lastOrder)) / 86_400_000;
  const sinceFirst = customer.firstOrder ? (now - Date.parse(customer.firstOrder)) / 86_400_000 : sinceLast;
  if (sinceLast > 120) return "Inactifs";
  if (sinceLast > 60) return "À risque";
  if (customer.orders >= 3) return "Fidèles";
  if (sinceFirst <= 30) return "Nouveaux";
  return "Fidèles";
}
export function matchesCustomSegment(
  customer: CustomerStats,
  rule: { minOrders?: number; minSpend?: number; inactiveDays?: number; minPoints?: number },
  now = Date.now(),
) {
  if (rule.minOrders !== undefined && customer.orders < rule.minOrders) return false;
  if (rule.minSpend !== undefined && customer.spend < rule.minSpend) return false;
  if (rule.minPoints !== undefined && customer.points < rule.minPoints) return false;
  if (rule.inactiveDays !== undefined && rule.inactiveDays > 0) {
    if (customer.lastOrder && (now - Date.parse(customer.lastOrder)) / 86_400_000 < rule.inactiveDays) return false;
  }
  return true;
}
export const allergenSchema = z
  .object({
    menuId: z.string().min(1).max(100),
    present: z.array(z.string()).max(14),
    traces: z.array(z.string()).max(14),
  })
  .strict();
/** Format publié sur la boutique : lisible par le client, relu par l’outil. */
export function formatAllergens(present: readonly string[], traces: readonly string[]) {
  const parts: string[] = [];
  if (present.length) parts.push(`Contient : ${present.join(", ")}`);
  if (traces.length) parts.push(`Traces possibles : ${traces.join(", ")}`);
  return parts.length ? `${parts.join(". ")}.` : "Aucun des 14 allergènes réglementaires.";
}
export function parseAllergens(text: string, known: readonly string[]) {
  const pick = (label: string) => {
    const match = new RegExp(`${label}\\s*:\\s*([^.]*)`, "i").exec(text);
    return match ? match[1].split(",").map((entry) => entry.trim()).filter((entry) => known.includes(entry)) : [];
  };
  return { present: pick("Contient"), traces: pick("Traces possibles") };
}
