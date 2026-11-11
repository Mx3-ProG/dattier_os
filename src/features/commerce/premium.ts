import { z } from "zod";
import type { DB } from "@/lib/database/db";

/** Add-on mensuel (9 € TTC) qui enrichit la boutique en ligne, toujours comprise dans Studio. */
export const CLICK_COLLECT_PREMIUM = "click-collect-premium";

/** Le Premium n'a de sens qu'avec la boutique installée : les deux droits sont exigés. */
export async function premiumActive(db: DB, restaurant: string) {
  const { rows } = await db.query<{ active: boolean }>(
    "SELECT app.addon_installed($1,'online-orders') AND app.addon_installed($1,$2) AS active",
    [restaurant, CLICK_COLLECT_PREMIUM],
  );
  return rows[0]?.active === true;
}

export async function requirePremium(db: DB, restaurant: string) {
  if (!(await premiumActive(db, restaurant)))
    throw new Error("Click & Collect Premium n’est pas actif pour cet établissement.");
}

export type FlowSettings = { prepMinutes: number; pausedUntil?: string | null; rushMinutes?: number };

/**
 * Réglages de flux réellement appliqués. Sans Premium actif, une pause ou un rush
 * enregistrés auparavant n'ont plus d'effet : la boutique gratuite reste inchangée.
 */
export function effectiveFlow(settings: FlowSettings, premium: boolean, now = Date.now()) {
  const until = premium && settings.pausedUntil ? Date.parse(settings.pausedUntil) : NaN;
  const paused = Number.isFinite(until) && until > now;
  const rush = premium ? (settings.rushMinutes ?? 0) : 0;
  return {
    paused,
    pausedUntil: paused ? new Date(until).toISOString() : null,
    rushMinutes: rush,
    prepMinutes: settings.prepMinutes + rush,
  };
}

/** Durées proposées à l'équipe ; 0 reprend les commandes, « reprise » vaut 12 h au plus. */
export const pauseChoices = [0, 15, 30, 60, 720] as const;
export const rushChoices = [0, 10, 20, 30, 45] as const;

export const flowActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pause"),
    minutes: z.union(pauseChoices.map((value) => z.literal(value)) as [
      z.ZodLiteral<0>, z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>, z.ZodLiteral<720>,
    ]),
  }),
  z.object({
    kind: z.literal("rush"),
    minutes: z.union(rushChoices.map((value) => z.literal(value)) as [
      z.ZodLiteral<0>, z.ZodLiteral<10>, z.ZodLiteral<20>, z.ZodLiteral<30>, z.ZodLiteral<45>,
    ]),
  }),
]);

/** Étapes affichées sur l'écran de retrait : jamais de nom ni de contenu de commande. */
export type BoardOrder = { number: number; stage: "preparing" | "ready"; consumption: string };
export function boardStage(itemStatuses: readonly string[], orderStatus: string): BoardOrder["stage"] | null {
  if (orderStatus === "cancelled" || orderStatus === "pending") return null;
  const items = itemStatuses.filter((status) => status !== "cancelled");
  if (!items.length || items.every((status) => status === "served")) return null;
  if (items.every((status) => status === "ready" || status === "served")) return "ready";
  return "preparing";
}
