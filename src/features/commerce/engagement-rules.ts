/**
 * Pure gamification rules for the customer account. No I/O: the server
 * (engagement.ts) and the tests use them, and the UI uses their results.
 */

export type Milestone = { count: number; points: number; label: string };

export type EngagementSettings = {
  points_per_euro: number;
  booking_points: number;
  referrer_points: number;
  welcome_kind: "fixed" | "percent";
  welcome_value: number;
  welcome_days: number;
  milestones: Milestone[];
};

export const defaultEngagementSettings: EngagementSettings = {
  points_per_euro: 1,
  booking_points: 20,
  referrer_points: 100,
  welcome_kind: "fixed",
  welcome_value: 500,
  welcome_days: 30,
  milestones: [
    { count: 3, points: 150, label: "Dessert offert" },
    { count: 5, points: 300, label: "Menu offert" },
    { count: 10, points: 800, label: "Ambassadeur de la maison" },
  ],
};

/** Points earned by an order, from its total in cents. */
export function orderPoints(totalCents: number, perEuro: number) {
  if (totalCents <= 0 || perEuro <= 0) return 0;
  return Math.floor((totalCents / 100) * perEuro);
}

export type FlashRule = {
  id: string;
  menu_id: string;
  kind: "percent" | "price";
  value: number;
  starts_at: string | Date;
  ends_at: string | Date;
  member_bonus_points: number;
  active: boolean;
};

/** Discounted price in cents; never above the regular price, never negative. */
export function flashPrice(price: number, rule: Pick<FlashRule, "kind" | "value">) {
  const next =
    rule.kind === "percent"
      ? Math.round((price * (100 - rule.value)) / 100)
      : rule.value;
  return Math.max(0, Math.min(price, next));
}

const time = (value: string | Date) => new Date(value).getTime();

export function isLive(rule: FlashRule, now = Date.now()) {
  return rule.active && time(rule.starts_at) <= now && now < time(rule.ends_at);
}

/** The live promotion that gives the lowest price for a dish, if any. */
export function bestFlash(
  rules: FlashRule[],
  menuId: string,
  price: number,
  now = Date.now(),
) {
  let best: { rule: FlashRule; price: number } | null = null;
  for (const rule of rules) {
    if (rule.menu_id !== menuId || !isLive(rule, now)) continue;
    const candidate = flashPrice(price, rule);
    if (candidate < price && (!best || candidate < best.price))
      best = { rule, price: candidate };
  }
  return best;
}

export type FlashInfo = {
  id: string;
  regular_price: number;
  ends_at: string;
  percent: number;
  member_bonus_points: number;
};

/** Applies the live flash prices to a catalog; the server recomputes them at checkout. */
export function applyFlash<T extends { id: string; price: number }>(
  products: T[],
  rules: FlashRule[],
  now = Date.now(),
): (T & { flash?: FlashInfo })[] {
  return products.map((product) => {
    const best = bestFlash(rules, product.id, product.price, now);
    if (!best) return product;
    return {
      ...product,
      price: best.price,
      flash: {
        id: best.rule.id,
        regular_price: product.price,
        ends_at: new Date(best.rule.ends_at).toISOString(),
        percent: Math.round((1 - best.price / product.price) * 100),
        member_bonus_points: best.rule.member_bonus_points,
      },
    };
  });
}

export const levels = [
  { key: "decouverte", name: "Découverte", min: 0 },
  { key: "gourmand", name: "Gourmand", min: 150 },
  { key: "fin-gourmet", name: "Fin gourmet", min: 500 },
  { key: "legende", name: "Légende", min: 1200 },
] as const;

export type Level = {
  key: string;
  name: string;
  rank: number;
  lifetime: number;
  next: { name: string; min: number; missing: number } | null;
  progress: number;
};

/** Level from the points earned over a lifetime (spending does not demote). */
export function levelFor(lifetime: number): Level {
  const points = Math.max(0, lifetime);
  let rank = 0;
  for (let n = 0; n < levels.length; n++) if (points >= levels[n].min) rank = n;
  const current = levels[rank],
    next = levels[rank + 1];
  return {
    key: current.key,
    name: current.name,
    rank,
    lifetime: points,
    next: next
      ? { name: next.name, min: next.min, missing: next.min - points }
      : null,
    progress: next
      ? Math.min(1, (points - current.min) / (next.min - current.min))
      : 1,
  };
}

export function sortedMilestones(milestones: Milestone[]) {
  return [...milestones]
    .filter((m) => m.count > 0)
    .sort((a, b) => a.count - b.count);
}

/** Next referral milestone not reached yet, or null when all are reached. */
export function nextMilestone(milestones: Milestone[], rewarded: number) {
  return sortedMilestones(milestones).find((m) => m.count > rewarded) ?? null;
}

/** Milestones reached with this many rewarded referrals. */
export function reachedMilestones(milestones: Milestone[], rewarded: number) {
  return sortedMilestones(milestones).filter((m) => m.count <= rewarded);
}

/** Consecutive months with an order, ending this month or last month. */
export function monthStreak(months: string[], now = new Date()) {
  const set = new Set(months);
  const key = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (!set.has(key(cursor))) cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  let streak = 0;
  while (set.has(key(cursor))) {
    streak++;
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return streak;
}

export type EngagementStats = {
  orders: number;
  dishes: number;
  referrals: number;
  visits: number;
  flash: number;
  reviews: number;
};

export const badgeCatalog: {
  key: string;
  name: string;
  hint: string;
  icon: string;
  earned: (s: EngagementStats) => boolean;
}[] = [
  { key: "premiere-commande", name: "Première commande", hint: "Passez votre première commande en ligne.", icon: "bag", earned: (s) => s.orders >= 1 },
  { key: "habitue-5", name: "Habitué", hint: "Passez 5 commandes.", icon: "repeat", earned: (s) => s.orders >= 5 },
  { key: "fidele-10", name: "Fidèle", hint: "Passez 10 commandes.", icon: "heart", earned: (s) => s.orders >= 10 },
  { key: "pilier-25", name: "Pilier de la maison", hint: "Passez 25 commandes.", icon: "crown", earned: (s) => s.orders >= 25 },
  { key: "curieux", name: "Gourmet curieux", hint: "Goûtez 5 plats différents.", icon: "sparkles", earned: (s) => s.dishes >= 5 },
  { key: "premier-filleul", name: "Premier filleul", hint: "Un ami parrainé passe sa première commande.", icon: "gift", earned: (s) => s.referrals >= 1 },
  { key: "ambassadeur", name: "Ambassadeur", hint: "3 amis parrainés ont commandé.", icon: "megaphone", earned: (s) => s.referrals >= 3 },
  { key: "a-table", name: "À table !", hint: "Venez sur place après une réservation.", icon: "calendar", earned: (s) => s.visits >= 1 },
  { key: "habitue-salle", name: "Habitué de la salle", hint: "Venez 3 fois après réservation.", icon: "utensils", earned: (s) => s.visits >= 3 },
  { key: "leve-tot", name: "Chasseur de flash", hint: "Profitez d’une promo flash.", icon: "zap", earned: (s) => s.flash >= 1 },
  { key: "critique", name: "Critique gourmand", hint: "Laissez un avis sur un produit.", icon: "star", earned: (s) => s.reviews >= 1 },
];

export function earnedBadges(stats: EngagementStats) {
  return badgeCatalog.filter((b) => b.earned(stats)).map((b) => b.key);
}

export type Mission = {
  key: string;
  title: string;
  detail: string;
  reward: string;
  href: string;
  progress: number;
};

/** Two or three contextual nudges, most useful first. */
export function missionsFor(input: {
  stats: EngagementStats;
  streak: number;
  hasOrderThisMonth: boolean;
  settings: EngagementSettings;
  consent: boolean;
  nextRewardMissing: number | null;
  upcomingBooking: boolean;
}): Mission[] {
  const { stats, settings } = input;
  const list: Mission[] = [];
  if (!input.consent)
    list.push({
      key: "join",
      title: "Activez votre fidélité",
      detail: "Gagnez des points à chaque commande et débloquez vos cadeaux.",
      reward: `${settings.points_per_euro} pt / €`,
      href: "#fidelite",
      progress: 0,
    });
  if (!input.hasOrderThisMonth)
    list.push({
      key: "streak",
      title:
        input.streak > 0
          ? `Gardez votre série de ${input.streak} mois`
          : "Lancez votre série gourmande",
      detail: "Commandez avant la fin du mois en click & collect.",
      reward: "+ série",
      href: "/commander",
      progress: 0,
    });
  if (input.nextRewardMissing !== null && input.nextRewardMissing > 0)
    list.push({
      key: "reward",
      title: `Plus que ${input.nextRewardMissing} points`,
      detail: "Votre prochaine récompense est à portée de fourchette.",
      reward: "Cadeau",
      href: "/commander",
      progress: 0.5,
    });
  if (!input.upcomingBooking && settings.booking_points > 0)
    list.push({
      key: "booking",
      title: "Réservez une table",
      detail: "Vos points sont crédités dès votre arrivée au restaurant.",
      reward: `+${settings.booking_points} pts`,
      href: "/reservations",
      progress: 0,
    });
  if (settings.referrer_points > 0)
    list.push({
      key: "invite",
      title: stats.referrals ? "Invitez un ami de plus" : "Invitez votre premier ami",
      detail: "Il reçoit un cadeau de bienvenue, vous gagnez des points.",
      reward: `+${settings.referrer_points} pts`,
      href: "#parrainage",
      progress: 0,
    });
  return list.slice(0, 3);
}
