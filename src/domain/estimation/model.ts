import { z } from "zod";

export const estimationItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["product", "service"]),
  name: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(24),
  priceCents: z.number().int().min(0).max(10_000_000),
  costCents: z.number().int().min(0).max(10_000_000).nullable(),
  defaultQuantity: z.number().int().min(0).max(10_000),
  maxQuantity: z.number().int().min(1).max(10_000),
  featured: z.boolean(),
}).strict().refine((item) => item.defaultQuantity <= item.maxQuantity, "Quantité initiale supérieure au maximum.");
export type EstimationItem = z.infer<typeof estimationItemSchema>;
export type PublicEstimationItem = Omit<EstimationItem, "costCents">;

export const estimationSaveSchema = z.object({
  title: z.string().trim().min(1).max(100),
  introduction: z.string().trim().max(500),
  items: z.array(estimationItemSchema).max(20),
  fixedCostsCents: z.number().int().min(0).max(100_000_000),
  published: z.boolean(),
  revision: z.number().int().min(0),
}).strict().superRefine((value, context) => {
  if (value.published && value.items.length === 0)
    context.addIssue({ code: "custom", message: "Ajoutez au moins un élément avant publication." });
  if (value.items.filter((item) => item.featured).length > 1)
    context.addIssue({ code: "custom", message: "Un seul élément peut être mis en avant." });
  if (new Set(value.items.map((item) => item.id)).size !== value.items.length)
    context.addIssue({ code: "custom", message: "Deux éléments portent le même identifiant." });
});
export type EstimationSave = z.infer<typeof estimationSaveSchema>;

export function calculateEstimation(
  items: readonly (PublicEstimationItem & { costCents?: number | null })[],
  quantities: Readonly<Record<string, number>>,
  fixedCostsCents = 0,
) {
  let revenueCents = 0;
  let directCostCents = 0;
  let costComplete = true;
  for (const item of items) {
    const quantity = quantities[item.id] ?? item.defaultQuantity;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > item.maxQuantity)
      throw new Error(`Quantité invalide pour ${item.name}.`);
    revenueCents += item.priceCents * quantity;
    if (item.costCents == null && quantity > 0) costComplete = false;
    else directCostCents += (item.costCents ?? 0) * quantity;
  }
  const totalCostCents = costComplete ? directCostCents + fixedCostsCents : null;
  return {
    revenueCents,
    directCostCents: costComplete ? directCostCents : null,
    fixedCostsCents,
    totalCostCents,
    marginCents: totalCostCents === null ? null : revenueCents - totalCostCents,
    marginRate: totalCostCents === null || revenueCents === 0 ? null :
      Math.round(((revenueCents - totalCostCents) / revenueCents) * 10_000) / 100,
  };
}

export const cents = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value / 100);
