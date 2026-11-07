import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import { requirePermission } from "@/lib/permissions";
import type { Actor } from "@/lib/auth/session";
import { log } from "@/features/orders/service";
import {
  applyFlash,
  badgeCatalog,
  defaultEngagementSettings,
  earnedBadges,
  flashPrice,
  levelFor,
  missionsFor,
  monthStreak,
  nextMilestone,
  orderPoints,
  reachedMilestones,
  sortedMilestones,
  type EngagementSettings,
  type EngagementStats,
  type FlashRule,
} from "./engagement-rules";

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function engagementSettings(
  db: DB,
  r: string,
): Promise<EngagementSettings> {
  const found = await rows<EngagementSettings>(
    db,
    "SELECT points_per_euro::float AS points_per_euro,booking_points,referrer_points,welcome_kind,welcome_value,welcome_days,milestones FROM loyalty_settings WHERE restaurant_id=$1",
    [r],
  );
  if (!found.length) return defaultEngagementSettings;
  return { ...found[0], milestones: sortedMilestones(found[0].milestones) };
}

export const engagementSettingsSchema = z
  .object({
    action: z.literal("engagementSettings"),
    points_per_euro: z.coerce.number().min(0).max(100),
    booking_points: z.coerce.number().int().min(0).max(10000),
    referrer_points: z.coerce.number().int().min(0).max(10000),
    welcome_kind: z.enum(["fixed", "percent"]),
    welcome_value: z.coerce.number().int().min(0),
    welcome_days: z.coerce.number().int().min(1).max(365),
    milestones: z
      .array(
        z.object({
          count: z.coerce.number().int().min(1).max(100),
          points: z.coerce.number().int().min(0).max(10000),
          label: z.string().trim().min(1).max(60),
        }),
      )
      .max(6),
  })
  .refine((s) => s.welcome_kind !== "percent" || s.welcome_value <= 100, {
    message: "Une remise en pourcentage ne peut pas dépasser 100 %.",
  });

export async function saveEngagementSettings(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof engagementSettingsSchema>,
) {
  requirePermission(user.roles ?? user.role, "customers");
  const milestones = sortedMilestones(a.milestones);
  if (new Set(milestones.map((m) => m.count)).size !== milestones.length)
    throw new Error("Deux paliers ne peuvent pas avoir le même nombre de filleuls.");
  await db.query(
    `INSERT INTO loyalty_settings(restaurant_id,points_per_euro,booking_points,referrer_points,welcome_kind,welcome_value,welcome_days,milestones,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT(restaurant_id) DO UPDATE SET points_per_euro=$2,booking_points=$3,referrer_points=$4,welcome_kind=$5,welcome_value=$6,welcome_days=$7,milestones=$8,updated_at=now()`,
    [
      r,
      a.points_per_euro,
      a.booking_points,
      a.referrer_points,
      a.welcome_kind,
      a.welcome_value,
      a.welcome_days,
      JSON.stringify(milestones),
    ],
  );
  await log(db, r, user.id, "Réglages de gamification modifiés");
}

/* ------------------------------------------------------------------ */
/* Points                                                              */
/* ------------------------------------------------------------------ */

/**
 * Credits points once per `reference`. The `shared_loyalty` trigger forwards
 * the change to the organisation wallet when loyalty is shared.
 */
export async function creditPoints(
  db: DB,
  customerId: string,
  points: number,
  reason: string,
  reference: string,
) {
  if (points <= 0) return false;
  const done = await rows(
    db,
    "SELECT id FROM loyalty_transactions WHERE customer_id=$1 AND reference=$2",
    [customerId, reference],
  );
  if (done.length) return false;
  await db.query("UPDATE customers SET points=points+$2 WHERE id=$1", [
    customerId,
    points,
  ]);
  await db.query(
    "INSERT INTO loyalty_transactions(id,customer_id,points,reason,actor,created_at,reference) VALUES($1,$2,$3,$4,NULL,now(),$5)",
    [randomUUID(), customerId, points, reason, reference],
  );
  return true;
}

/** Credits an online order's points once it is paid or served. Idempotent. */
export async function awardOrderPoints(db: DB, r: string, orderId: string) {
  const found = await rows<{
    customer_id: string | null;
    total: number;
    number: number;
    loyalty_awarded_at: string | null;
    flash_bonus_points: number;
    consent: boolean | null;
    status: string;
  }>(
    db,
    `SELECT so.customer_id,so.total,so.number,so.loyalty_awarded_at,so.flash_bonus_points,c.consent,o.status
       FROM shop_orders so JOIN orders o ON o.id=so.order_id LEFT JOIN customers c ON c.id=so.customer_id
      WHERE so.order_id=$1 AND o.restaurant_id=$2 FOR UPDATE OF so`,
    [orderId, r],
  );
  const o = found[0];
  if (!o || !o.customer_id || o.loyalty_awarded_at || o.status === "cancelled")
    return 0;
  const settings = await engagementSettings(db, r);
  const points = o.consent
    ? orderPoints(o.total, settings.points_per_euro) + o.flash_bonus_points
    : 0;
  if (points)
    await creditPoints(
      db,
      o.customer_id,
      points,
      `Commande #${o.number}`,
      `order:${orderId}`,
    );
  await db.query(
    "UPDATE shop_orders SET loyalty_points=$2,loyalty_awarded_at=now() WHERE order_id=$1",
    [orderId, points],
  );
  await settleReferral(db, r, o.customer_id);
  await refreshBadges(db, o.customer_id);
  return points;
}

/** Points for a guest marked as arrived after booking from their account. */
export async function awardBookingPoints(db: DB, r: string, reservationId: string) {
  const res = await rows<{ customer_id: string | null; consent: boolean | null }>(
    db,
    "SELECT r.customer_id,c.consent FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id WHERE r.id=$1 AND r.restaurant_id=$2",
    [reservationId, r],
  );
  const customer = res[0]?.customer_id;
  if (!customer) return 0;
  const settings = await engagementSettings(db, r);
  const points = res[0].consent ? settings.booking_points : 0;
  if (points)
    await creditPoints(
      db,
      customer,
      points,
      "Visite au restaurant après réservation",
      `reservation:${reservationId}`,
    );
  await refreshBadges(db, customer);
  return points;
}

/** Customer opts in to the loyalty programme from their account. */
export async function joinLoyalty(db: DB, customerId: string) {
  await db.query("UPDATE customers SET consent=true WHERE id=$1", [customerId]);
}

/* ------------------------------------------------------------------ */
/* Customer referral                                                   */
/* ------------------------------------------------------------------ */

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function referralCode() {
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

/** Gives the customer a referral code; requires the loyalty programme. */
export async function ensureReferralCode(db: DB, r: string, customerId: string) {
  const existing = await rows<{ code: string }>(
    db,
    "SELECT code FROM customer_referral_codes WHERE customer_id=$1",
    [customerId],
  );
  if (existing.length) return existing[0].code;
  const c = await one<{ consent: boolean }>(
    db,
    "SELECT consent FROM customers WHERE id=$1 AND restaurant_id=$2",
    [customerId, r],
  );
  if (!c.consent)
    throw new Error("Activez le programme de fidélité pour parrainer vos amis.");
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = referralCode();
    const taken = await rows(
      db,
      "SELECT 1 FROM customer_referral_codes WHERE code=$1",
      [code],
    );
    if (taken.length) continue;
    await db.query(
      "INSERT INTO customer_referral_codes(customer_id,restaurant_id,code) VALUES($1,$2,$3)",
      [customerId, r, code],
    );
    return code;
  }
  throw new Error("Code de parrainage indisponible, réessayez.");
}

export const referralCodePattern = /^[A-Z0-9]{8}$/;

/** First name of the referrer, for the invitation banner. */
export async function referralInvitation(db: DB, r: string, raw: string) {
  const code = raw.trim().toUpperCase();
  if (!referralCodePattern.test(code)) return null;
  const found = await rows<{ name: string }>(
    db,
    "SELECT c.name FROM customer_referral_codes rc JOIN customers c ON c.id=rc.customer_id WHERE rc.code=$1 AND rc.restaurant_id=$2",
    [code, r],
  );
  if (!found.length) return null;
  const settings = await engagementSettings(db, r);
  return {
    referrer: firstName(found[0].name),
    welcome: welcomeLabel(settings),
  };
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Un ami";
}

export function welcomeLabel(s: EngagementSettings) {
  if (!s.welcome_value) return "";
  return s.welcome_kind === "percent"
    ? `${s.welcome_value} % offerts`
    : `${(s.welcome_value / 100).toLocaleString("fr-FR", { minimumFractionDigits: s.welcome_value % 100 ? 2 : 0 })} € offerts`;
}

/**
 * Links a new customer to their referrer and issues the welcome gift code.
 * Only customers without any order yet can be referred, and only once.
 */
export async function attachCustomerReferral(
  db: DB,
  r: string,
  customerId: string,
  user: Actor,
  raw: string,
) {
  const code = raw.trim().toUpperCase();
  if (!referralCodePattern.test(code))
    throw new Error("Lien de parrainage invalide.");
  const prior = await rows<{ welcome_promo_id: string | null }>(
    db,
    "SELECT welcome_promo_id FROM customer_referrals WHERE referred_customer_id=$1",
    [customerId],
  );
  if (prior.length) return { attached: false, reason: "already" as const };
  const referrer = await rows<{ customer_id: string; account_id: string | null }>(
    db,
    "SELECT rc.customer_id,c.account_id FROM customer_referral_codes rc JOIN customers c ON c.id=rc.customer_id WHERE rc.code=$1 AND rc.restaurant_id=$2",
    [code, r],
  );
  if (!referrer.length) throw new Error("Lien de parrainage introuvable.");
  const me = await one<{ account_id: string | null; contact: string }>(
    db,
    "SELECT account_id,contact FROM customers WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [customerId, r],
  );
  if (
    referrer[0].customer_id === customerId ||
    (me.account_id && me.account_id === referrer[0].account_id)
  )
    throw new Error("Vous ne pouvez pas utiliser votre propre lien.");
  const orders = await one<{ count: number }>(
    db,
    "SELECT count(*)::int AS count FROM shop_orders WHERE customer_id=$1",
    [customerId],
  );
  if (orders.count)
    throw new Error("Le parrainage est réservé aux nouveaux clients.");
  const settings = await engagementSettings(db, r);
  let promoId: string | null = null,
    welcome: string | null = null;
  if (settings.welcome_value > 0) {
    promoId = randomUUID();
    welcome = "BIENVENUE-" + randomBytes(4).toString("hex").toUpperCase();
    await db.query(
      "INSERT INTO promo_codes(id,restaurant_id,customer_id,code,kind,value,points_cost,expires_on,token,created_by) VALUES($1,$2,$3,$4,$5,$6,0,CURRENT_DATE+$7::int,$8,$9)",
      [
        promoId,
        r,
        customerId,
        welcome,
        settings.welcome_kind,
        settings.welcome_value,
        settings.welcome_days,
        randomBytes(32).toString("hex"),
        user.id,
      ],
    );
  }
  await db.query(
    "INSERT INTO customer_referrals(referred_customer_id,referrer_customer_id,restaurant_id,welcome_promo_id) VALUES($1,$2,$3,$4)",
    [customerId, referrer[0].customer_id, r, promoId],
  );
  return { attached: true, welcome };
}

/** On the referred customer's first paid order: rewards the referrer. */
export async function settleReferral(db: DB, r: string, referredId: string) {
  const ref = await rows<{ referrer_customer_id: string; name: string }>(
    db,
    "SELECT cr.referrer_customer_id,c.name FROM customer_referrals cr JOIN customers c ON c.id=cr.referred_customer_id WHERE cr.referred_customer_id=$1 AND cr.restaurant_id=$2 AND cr.rewarded_at IS NULL FOR UPDATE OF cr",
    [referredId, r],
  );
  if (!ref.length) return false;
  const referrer = ref[0].referrer_customer_id;
  await db.query(
    "UPDATE customer_referrals SET rewarded_at=now() WHERE referred_customer_id=$1",
    [referredId],
  );
  const settings = await engagementSettings(db, r);
  await creditPoints(
    db,
    referrer,
    settings.referrer_points,
    `Parrainage : ${firstName(ref[0].name)} a passé sa première commande`,
    `referral:${referredId}`,
  );
  const rewarded = await one<{ count: number }>(
    db,
    "SELECT count(*)::int AS count FROM customer_referrals WHERE referrer_customer_id=$1 AND rewarded_at IS NOT NULL",
    [referrer],
  );
  for (const m of reachedMilestones(settings.milestones, rewarded.count))
    await creditPoints(
      db,
      referrer,
      m.points,
      `Palier parrainage ${m.count} amis : ${m.label}`,
      `referral-milestone:${m.count}`,
    );
  await refreshBadges(db, referrer);
  return true;
}

/* ------------------------------------------------------------------ */
/* Flash promotions                                                    */
/* ------------------------------------------------------------------ */

export async function liveFlashRules(db: DB, r: string, now = new Date()) {
  return rows<FlashRule>(
    db,
    "SELECT id,menu_id,kind,value,starts_at,ends_at,member_bonus_points,active FROM flash_promotions WHERE restaurant_id=$1 AND active AND starts_at<=$2 AND ends_at>$2",
    [r, now.toISOString()],
  );
}

export async function withFlashPrices<T extends { id: string; price: number }>(
  db: DB,
  r: string,
  products: T[],
  now = new Date(),
) {
  return applyFlash(products, await liveFlashRules(db, r, now), now.getTime());
}

export const flashSchema = z
  .object({
    action: z.literal("flashPromotion"),
    menu: z.string().min(1),
    kind: z.enum(["percent", "price"]),
    value: z.coerce.number().int().positive(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    member_bonus_points: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .refine((f) => f.kind !== "percent" || f.value <= 90, {
    message: "Une promo flash ne peut pas dépasser 90 %.",
  })
  .refine((f) => Date.parse(f.ends_at) > Date.parse(f.starts_at), {
    message: "La fin doit suivre le début.",
  });

export const stopFlashSchema = z.object({
  action: z.literal("stopFlashPromotion"),
  id: z.string().min(1),
});

export async function createFlashPromotion(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof flashSchema>,
) {
  requirePermission(user.roles ?? user.role, "catalog");
  const item = await one<{ price: number; name: string }>(
    db,
    "SELECT price,name FROM menu_items WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL",
    [a.menu, r],
  );
  if (a.kind === "price" && a.value >= item.price)
    throw new Error("Le prix flash doit être inférieur au prix habituel.");
  if (Date.parse(a.ends_at) - Date.parse(a.starts_at) > 31 * 86400000)
    throw new Error("Une promo flash dure au maximum 31 jours.");
  const id = randomUUID();
  await db.query(
    "INSERT INTO flash_promotions(id,restaurant_id,menu_id,kind,value,starts_at,ends_at,member_bonus_points,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      r,
      a.menu,
      a.kind,
      a.value,
      a.starts_at,
      a.ends_at,
      a.member_bonus_points,
      user.id,
    ],
  );
  await log(db, r, user.id, `Promo flash créée : ${item.name}`, id);
  return id;
}

export async function stopFlashPromotion(db: DB, r: string, user: Actor, id: string) {
  requirePermission(user.roles ?? user.role, "catalog");
  await one(
    db,
    "UPDATE flash_promotions SET active=false WHERE id=$1 AND restaurant_id=$2 RETURNING id",
    [id, r],
  );
  await log(db, r, user.id, "Promo flash arrêtée", id);
}

/** Admin list: current and upcoming flash promotions. */
export async function adminFlashPromotions(db: DB, r: string) {
  return rows<{
    id: string;
    menu_id: string;
    menu_name: string;
    regular_price: number;
    kind: "percent" | "price";
    value: number;
    starts_at: string;
    ends_at: string;
    member_bonus_points: number;
    active: boolean;
  }>(
    db,
    "SELECT f.id,f.menu_id,m.name AS menu_name,m.price AS regular_price,f.kind,f.value,f.starts_at,f.ends_at,f.member_bonus_points,f.active FROM flash_promotions f JOIN menu_items m ON m.id=f.menu_id WHERE f.restaurant_id=$1 AND f.active AND f.ends_at>now() ORDER BY f.starts_at",
    [r],
  );
}

/* ------------------------------------------------------------------ */
/* Badges and account view                                             */
/* ------------------------------------------------------------------ */

async function stats(db: DB, customerId: string): Promise<EngagementStats> {
  return one<EngagementStats>(
    db,
    `SELECT
      (SELECT count(*)::int FROM shop_orders so JOIN orders o ON o.id=so.order_id WHERE so.customer_id=$1 AND o.status<>'cancelled') AS orders,
      (SELECT count(DISTINCT oi.menu_id)::int FROM shop_orders so JOIN order_items oi ON oi.order_id=so.order_id WHERE so.customer_id=$1 AND oi.status<>'cancelled') AS dishes,
      (SELECT count(*)::int FROM customer_referrals WHERE referrer_customer_id=$1 AND rewarded_at IS NOT NULL) AS referrals,
      (SELECT count(*)::int FROM reservations WHERE customer_id=$1 AND status='arrived') AS visits,
      (SELECT count(*)::int FROM shop_orders so JOIN orders o ON o.id=so.order_id WHERE so.customer_id=$1 AND so.flash_items>0 AND o.status<>'cancelled') AS flash,
      (SELECT count(*)::int FROM product_reviews WHERE customer_id=$1) AS reviews`,
    [customerId],
  );
}

/** Records newly earned badges; returns the stats used. */
export async function refreshBadges(db: DB, customerId: string) {
  const s = await stats(db, customerId);
  for (const badge of earnedBadges(s))
    await db.query(
      "INSERT INTO customer_badges(customer_id,badge) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [customerId, badge],
    );
  return s;
}

export type AccountEngagement = Awaited<ReturnType<typeof accountEngagement>>;

/** Everything the gamified account shows besides orders and rewards. */
export async function accountEngagement(
  db: DB,
  r: string,
  customerId: string,
  points: number,
  consent: boolean,
  rewards: { points_cost: number }[],
  now = new Date(),
) {
  const settings = await engagementSettings(db, r);
  const s = await refreshBadges(db, customerId);
  const earned = await rows<{ badge: string; earned_at: string }>(
    db,
    "SELECT badge,earned_at FROM customer_badges WHERE customer_id=$1",
    [customerId],
  );
  const earnedAt = new Map(earned.map((b) => [b.badge, b.earned_at]));
  const lifetime = await one<{ total: number }>(
    db,
    "SELECT coalesce(sum(points) FILTER (WHERE points>0),0)::int AS total FROM loyalty_transactions WHERE customer_id=$1",
    [customerId],
  );
  const months = await rows<{ month: string }>(
    db,
    "SELECT DISTINCT to_char(o.created_at AT TIME ZONE 'Europe/Paris','YYYY-MM') AS month FROM shop_orders so JOIN orders o ON o.id=so.order_id WHERE so.customer_id=$1 AND o.status<>'cancelled'",
    [customerId],
  );
  const thisMonth = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .slice(0, 7);
  const code = await rows<{ code: string }>(
    db,
    "SELECT code FROM customer_referral_codes WHERE customer_id=$1",
    [customerId],
  );
  const friends = await rows<{ name: string; created_at: string; rewarded_at: string | null }>(
    db,
    "SELECT c.name,cr.created_at,cr.rewarded_at FROM customer_referrals cr JOIN customers c ON c.id=cr.referred_customer_id WHERE cr.referrer_customer_id=$1 ORDER BY cr.created_at DESC LIMIT 30",
    [customerId],
  );
  const rewarded = friends.filter((f) => f.rewarded_at).length;
  const flash = await rows<{
    id: string;
    menu_id: string;
    name: string;
    image: string | null;
    category: string;
    price: number;
    kind: "percent" | "price";
    value: number;
    ends_at: string;
    member_bonus_points: number;
  }>(
    db,
    `SELECT f.id,f.menu_id,m.name,m.images->>0 AS image,m.category,m.price,f.kind,f.value,f.ends_at,f.member_bonus_points
       FROM flash_promotions f JOIN menu_items m ON m.id=f.menu_id
      WHERE f.restaurant_id=$1 AND f.active AND f.starts_at<=$2 AND f.ends_at>$2 AND m.enabled AND m.archived_at IS NULL
      ORDER BY f.ends_at LIMIT 12`,
    [r, now.toISOString()],
  );
  const reservations = await rows<{
    id: string;
    guests: number;
    starts_at: string;
    status: string;
  }>(
    db,
    "SELECT id,guests,starts_at,status FROM reservations WHERE customer_id=$1 AND restaurant_id=$2 ORDER BY starts_at DESC LIMIT 12",
    [customerId, r],
  );
  const history = await rows<{ points: number; reason: string; created_at: string }>(
    db,
    "SELECT points,reason,created_at FROM loyalty_transactions WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 20",
    [customerId],
  );
  const welcome = await rows<{ code: string; kind: string; value: number; expires_on: string; status: string }>(
    db,
    "SELECT p.code,p.kind,p.value,p.expires_on::text,p.status FROM customer_referrals cr JOIN promo_codes p ON p.id=cr.welcome_promo_id WHERE cr.referred_customer_id=$1 AND p.status='active' AND p.expires_on>=CURRENT_DATE",
    [customerId],
  );
  const gifts = await rows<{ code: string; kind: string; value: number; expires_on: string }>(
    db,
    "SELECT code,kind,value,expires_on::text FROM promo_codes WHERE customer_id=$1 AND restaurant_id=$2 AND status='active' AND expires_on>=CURRENT_DATE ORDER BY expires_on LIMIT 10",
    [customerId, r],
  );
  const upcoming = reservations.filter(
    (b) =>
      Date.parse(b.starts_at) > now.getTime() &&
      ["requested", "confirmed"].includes(b.status),
  );
  const nextReward = [...rewards]
    .sort((a, b) => a.points_cost - b.points_cost)
    .find((reward) => reward.points_cost > points);
  const streak = monthStreak(
    months.map((m) => m.month),
    new Date(`${thisMonth}-15T12:00:00Z`),
  );
  return {
    settings: {
      points_per_euro: settings.points_per_euro,
      booking_points: settings.booking_points,
      referrer_points: settings.referrer_points,
      welcome: welcomeLabel(settings),
      milestones: settings.milestones,
    },
    level: levelFor(lifetime.total),
    stats: s,
    streak,
    badges: badgeCatalog.map((b) => ({
      key: b.key,
      name: b.name,
      hint: b.hint,
      icon: b.icon,
      earned_at: earnedAt.get(b.key) ?? null,
    })),
    referral: {
      code: code[0]?.code ?? null,
      friends: friends.map((f) => ({
        name: firstName(f.name),
        joined_at: f.created_at,
        ordered: Boolean(f.rewarded_at),
      })),
      rewarded,
      next: nextMilestone(settings.milestones, rewarded),
    },
    flash: flash.map((f) => ({
      id: f.id,
      menu_id: f.menu_id,
      name: f.name,
      image: f.image,
      category: f.category,
      regular_price: f.price,
      price: flashPrice(f.price, f),
      ends_at: new Date(f.ends_at).toISOString(),
      member_bonus_points: f.member_bonus_points,
    })),
    reservations: reservations.map((b) => ({
      ...b,
      starts_at: new Date(b.starts_at).toISOString(),
    })),
    pointsHistory: history.map((h) => ({
      ...h,
      created_at: new Date(h.created_at).toISOString(),
    })),
    gifts,
    welcome: welcome[0] ?? null,
    missions: missionsFor({
      stats: s,
      streak,
      hasOrderThisMonth: months.some((m) => m.month === thisMonth),
      settings,
      consent,
      nextRewardMissing: nextReward ? nextReward.points_cost - points : null,
      upcomingBooking: upcoming.length > 0,
    }),
  };
}
