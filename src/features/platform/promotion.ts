import { basePlan } from "./pricing";

// Display configuration reused from the existing Black Friday campaign.
export const blackFriday = {
  code: "BLACKFRIDAY",
  endsAt: "2026-11-17T00:00:00+01:00",
  discount: 30,
  months: 3,
  trialDays: 7,
} as const;

export type Promotion = typeof blackFriday & { price: number; lastDay: string };

/** L’offre en cours, ou null une fois la date de fin passée. */
export function activePromotion(now = new Date()): Promotion | null {
  if (now.getTime() >= Date.parse(blackFriday.endsAt)) return null;
  return { ...blackFriday, price: basePlan - blackFriday.discount, lastDay: "lundi 16 novembre" };
}

