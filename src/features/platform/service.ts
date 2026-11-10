import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { rows, one, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { roles } from "@/lib/permissions";
import { log } from "@/features/orders/service";
import { setLayoutAccess } from "@/features/floor/service";
import { industries, trades, freeTradeTools, discoverySources, workflowChoices, type Industry } from "@/features/onboarding/catalog";
const text = z.string().trim().min(2).max(150),
  id = z.string().min(1).max(150);
const industry = z.enum(industries);
const activity = z.object({
  industry,
  trade: z.string().trim().min(2).max(100),
  tradeDetail: z.string().trim().max(300).default(""),
}).refine((value) => trades[value.industry].includes(value.trade), "Métier inconnu pour ce secteur.")
  .refine((value) => !value.trade.startsWith("Autre") || !!value.tradeDetail, "Précisez votre activité.");
const answers = z.object({
  teamSize: z.enum(["solo", "2-5", "6-20", "21+"]),
  workflows: z.array(z.enum(workflowChoices)).max(5),
  currentTools: z.string().trim().max(300).default(""),
  mainChallenge: z.string().trim().min(2).max(500),
});
const professional = z.object({
  jobTitle: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(40).default(""),
});
const onboarding = z.object({
  action: z.literal("onboard"),
  requestKey: z.uuid(),
  organization: text,
  restaurant: text,
  plan: z.literal(39).default(39),
  professional,
  activity,
  answers,
  discovery: z.object({ source: z.enum(discoverySources), detail: z.string().trim().max(300).default("") })
    .refine((value) => value.source !== "other" || !!value.detail, "Précisez comment vous nous avez connus."),
  referral: z.string().regex(/^[A-Fa-f0-9]{10}$/).optional().catch(undefined),
});
export const platformAction = z.discriminatedUnion("action", [
  onboarding,
  z.object({ action: z.literal("restaurant"), organization: id, name: text, activity }),
  z.object({ action: z.literal("activity"), restaurant: id, activity }),
  z.object({ action: z.literal("cancelSubscription"), organization: id }),
  z.object({
    action: z.literal("invite"),
    restaurant: id,
    email: z.email().max(150),
    roles: z
      .array(z.enum(roles).exclude(["SUPER_ADMIN"]))
      .min(1)
      .max(8),
  }),
  z.object({
    action: z.literal("accept"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    action: z.literal("membership"),
    restaurant: id,
    profile: id,
    roles: z.array(z.enum(roles).exclude(["SUPER_ADMIN"])).max(8),
  }),
  z.object({
    action: z.literal("floorLayout"),
    restaurant: id,
    profile: id,
    allowed: z.boolean(),
  }),
  z.object({
    action: z.literal("support"),
    restaurant: id,
    profile: id,
    reason: z.string().trim().min(10).max(500),
    minutes: z.number().int().min(5).max(60),
  }),
  z.object({ action: z.literal("revokeSupport"), restaurant: id, grant: id }),
  z.object({
    action: z.literal("referralVisibility"),
    organization: id,
    visible: z.boolean(),
  }),
  z.object({
    action: z.literal("loyaltyScope"),
    organization: id,
    scope: z.enum(["restaurant", "organization"]),
  }),
]);
export async function initializeRestaurant(db: DB, r: string) {
  await db.query(
    "INSERT INTO shop_settings(restaurant_id,config) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [
      r,
      JSON.stringify({
        open: false,
        prepMinutes: 20,
        interval: 15,
        capacity: 10,
        hours: [],
        categories: ["Entrées", "Plats", "Desserts", "Boissons"],
        address: "",
        phone: "",
        logo: "",
        googleBusinessUrl: "",
        googleReviewUrl: "",
      }),
    ],
  );
  await db.query(
    "INSERT INTO site_documents(restaurant_id) VALUES($1) ON CONFLICT DO NOTHING",
    [r],
  );
}
export async function overview(db: DB, user: Actor) {
  return {
    user,
    draft: (await rows<{ draft: unknown }>(db, "SELECT draft FROM onboarding_drafts WHERE profile_id=$1", [user.id]))[0]?.draft ?? null,
    platformAdmin: (
      await one<{ allowed: boolean }>(
        db,
        "SELECT app.is_platform_admin($1) AS allowed",
        [user.id],
      )
    ).allowed,
    organizations: await rows(
      db,
      "SELECT o.*,m.role,p.*,t.trial_ends_at,t.cancelled_at,t.trial_active,s.referral_code,s.referrals,s.paying_referrals,s.activated_total,s.activated_month,s.credits,creator.name AS creator_name,creator.email AS creator_email,creator.job_title AS creator_job_title,creator.work_phone AS creator_work_phone FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id LEFT JOIN profiles creator ON creator.id=o.created_by CROSS JOIN LATERAL app.organization_plan(o.id) p LEFT JOIN LATERAL app.organization_trial(o.id) t ON true LEFT JOIN LATERAL app.referral_summary(o.id) s ON true WHERE m.profile_id=$1 ORDER BY o.name",
      [user.id],
    ),
    restaurants: await rows(
      db,
      "SELECT DISTINCT r.*,app.restaurant_plan(r.id) AS plan,COALESCE((SELECT array_agg(rm.role::text) FROM memberships rm WHERE rm.restaurant_id=r.id AND rm.profile_id=$1),(SELECT ARRAY['OWNER']::text[] WHERE EXISTS(SELECT 1 FROM organization_memberships omx WHERE omx.organization_id=r.organization_id AND omx.profile_id=$1 AND omx.role IN ('OWNER','ADMIN')))) AS user_roles FROM restaurants r LEFT JOIN memberships m ON m.restaurant_id=r.id LEFT JOIN organization_memberships om ON om.organization_id=r.organization_id WHERE r.archived_at IS NULL AND (m.profile_id=$1 OR (om.profile_id=$1 AND om.role IN ('OWNER','ADMIN'))) ORDER BY r.name",
      [user.id],
    ),
  };
}
export async function assertAdmin(db: DB, user: Actor, r: string) {
  const u = await scope(db, user, r);
  if (!(u.roles || [u.role]).includes("OWNER"))
    throw new Error("Administration non autorisée.");
  return u;
}
export async function platformPerform(db: DB, user: Actor, raw: unknown) {
  const a = platformAction.parse(raw);
  if (a.action === "onboard") {
    // The profile row serializes retries of the same request across tabs.
    await db.query("SELECT id FROM profiles WHERE id=$1 FOR UPDATE", [user.id]);
    const existing = await rows<{ id: string; restaurant: string; trial_ends_at: string | null }>(db,
      "SELECT o.id,o.first_restaurant_id AS restaurant,t.trial_ends_at FROM organizations o LEFT JOIN LATERAL app.organization_trial(o.id) t ON true WHERE o.created_by=$1 AND o.creation_key=$2",
      [user.id, a.requestKey]);
    if (existing[0]) return { organization: existing[0].id, restaurant: existing[0].restaurant, trialEndsAt: existing[0].trial_ends_at };
    const org = randomUUID(),
      r = randomUUID();
    await db.query("SELECT app.bootstrap_organization($1,$2,$3,$4)", [
      org,
      a.organization,
      r,
      a.restaurant,
    ]);
    await db.query("UPDATE organizations SET requested_plan=$2 WHERE id=$1", [
      org,
      a.plan,
    ]);
    await db.query("UPDATE profiles SET job_title=$2,work_phone=$3 WHERE id=$1", [user.id,a.professional.jobTitle,a.professional.phone]);
    await db.query("UPDATE organizations SET created_by=$2,creation_key=$3,first_restaurant_id=$4,discovery_source=$5,discovery_detail=$6,onboarding_answers=$7::jsonb WHERE id=$1",
      [org,user.id,a.requestKey,r,a.discovery.source,a.discovery.detail,JSON.stringify(a.answers)]);
    await saveActivity(db,r,a.activity,a.answers);
    await installFreeTradeTools(db,r,a.activity.industry);
    const trial = await one<{ trial_ends_at: string }>(
      db,
      "SELECT app.start_organization_trial($1) AS trial_ends_at",
      [org],
    );
    if (a.referral)
      await db.query("SELECT app.attach_referral($1,$2)", [org, a.referral]);
    await db.query("DELETE FROM onboarding_drafts WHERE profile_id=$1", [user.id]);
    return { organization: org, restaurant: r, trialEndsAt: trial.trial_ends_at };
  }
  if (a.action === "cancelSubscription") {
    await db.query("SELECT app.cancel_organization_subscription($1)", [a.organization]);
    return { cancelled: true };
  }
  if (a.action === "accept") {
    await db.query("SELECT app.accept_invitation($1)", [
      createHash("sha256").update(a.token).digest("hex"),
    ]);
    return { accepted: true };
  }
  if (a.action === "restaurant") {
    await one(
      db,
      "SELECT organization_id FROM organization_memberships WHERE organization_id=$1 AND profile_id=$2 AND role IN ('OWNER','ADMIN')",
      [a.organization, user.id],
    );
    const billing = await one<{
      plan: number;
      occupied: number;
      seats: number;
    }>(db, "SELECT * FROM app.organization_plan($1)", [a.organization]);
    if (!billing.plan) throw new Error("Accès non autorisé avant activation.");
    if (billing.occupied >= billing.seats)
      throw new Error("Quota d’établissements atteint.");
    const r = randomUUID();
    await db.query(
      "INSERT INTO restaurants(id,name,organization_id) VALUES($1,$2,$3)",
      [r, a.name, a.organization],
    );
    await db.query("INSERT INTO memberships VALUES($1,$2,'OWNER')", [
      user.id,
      r,
    ]);
    await saveActivity(db,r,a.activity,{});
    await installFreeTradeTools(db,r,a.activity.industry);
    return { restaurant: r };
  }
  if (a.action === "activity") {
    await assertAdmin(db,user,a.restaurant);
    const previous=await one<{industry:Industry}>(db,"SELECT industry FROM restaurants WHERE id=$1",[a.restaurant]);
    if (previous.industry === "restaurant" && a.activity.industry !== "restaurant") {
      const pending=await one<{active:boolean}>(db,
        "SELECT EXISTS(SELECT 1 FROM orders WHERE restaurant_id=$1 AND status IN ('pending','active')) OR EXISTS(SELECT 1 FROM reservations WHERE restaurant_id=$1 AND status IN ('requested','confirmed','arrived') AND ends_at>now()) OR EXISTS(SELECT 1 FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id WHERE t.restaurant_id=$1 AND s.closed_at IS NULL) AS active",
        [a.restaurant]);
      if (pending.active) throw new Error("Terminez les commandes, réservations et services de table en cours avant de changer de métier.");
    }
    await saveActivity(db,a.restaurant,a.activity);
    await installFreeTradeTools(db,a.restaurant,a.activity.industry,previous.industry);
    return { updated: true };
  }
  if (a.action === "referralVisibility") {
    await db.query("SELECT app.set_referral_visibility($1,$2)", [
      a.organization,
      a.visible,
    ]);
    return { visible: a.visible };
  }
  if (a.action === "loyaltyScope") {
    await one(
      db,
      "SELECT organization_id FROM organization_memberships WHERE organization_id=$1 AND profile_id=$2 AND role IN ('OWNER','ADMIN')",
      [a.organization, user.id],
    );
    const billing = await one<{ plan: number }>(
      db,
      "SELECT plan FROM app.organization_plan($1)",
      [a.organization],
    );
    if (billing.plan < 39)
      throw new Error("Accès non autorisé avec le forfait actuel.");
    await db.query("SELECT app.set_loyalty_scope($1,$2)", [
      a.organization,
      a.scope,
    ]);
    return { scope: a.scope };
  }
  await assertAdmin(db, user, a.restaurant);
  if (a.action === "invite") {
    const token = randomBytes(32).toString("hex"),
      iid = randomUUID();
    const org = await one<{ organization_id: string }>(
      db,
      "SELECT organization_id FROM restaurants WHERE id=$1",
      [a.restaurant],
    );
    await db.query(
      "INSERT INTO invitations(id,organization_id,restaurant_id,email,roles,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days',$7)",
      [
        iid,
        org.organization_id,
        a.restaurant,
        a.email.toLowerCase(),
        JSON.stringify([...new Set(a.roles)]),
        createHash("sha256").update(token).digest("hex"),
        user.id,
      ],
    );
    await log(db, a.restaurant, user.id, "Invitation créée", iid);
    return { token };
  }
  if (a.action === "membership") {
    if (a.profile === user.id)
      throw new Error(
        "Utilisez un autre administrateur pour modifier vos propres accès.",
      );
    const owners = await rows<{ profile_id: string }>(
      db,
      "SELECT profile_id FROM memberships WHERE restaurant_id=$1 AND role='OWNER' FOR UPDATE",
      [a.restaurant],
    );
    if (
      owners.some((p) => p.profile_id === a.profile) &&
      owners.length === 1 &&
      !a.roles.includes("OWNER")
    )
      throw new Error("Dernier propriétaire protégé.");
    await db.query(
      "DELETE FROM memberships WHERE profile_id=$1 AND restaurant_id=$2",
      [a.profile, a.restaurant],
    );
    for (const role of new Set(a.roles))
      await db.query("INSERT INTO memberships VALUES($1,$2,$3)", [
        a.profile,
        a.restaurant,
        role,
      ]);
    await log(db, a.restaurant, user.id, "Affectations modifiées", a.profile);
    return { updated: true };
  }
  if (a.action === "floorLayout") {
    await setLayoutAccess(db, a.restaurant, user, a.profile, a.allowed);
    return { updated: true };
  }
  if (a.action === "support") {
    const target = await one<{ allowed: boolean }>(
      db,
      "SELECT app.is_platform_admin($1) AS allowed",
      [a.profile],
    );
    if (!target.allowed) throw new Error("Support non autorisé.");
    const gid = randomUUID();
    await db.query(
      "INSERT INTO support_grants(id,profile_id,restaurant_id,reason,expires_at,approved_by) VALUES($1,$2,$3,$4,now()+make_interval(mins=>$5),$6)",
      [gid, a.profile, a.restaurant, a.reason, a.minutes, user.id],
    );
    await log(
      db,
      a.restaurant,
      user.id,
      "Accès support temporaire autorisé",
      gid,
    );
    return { id: gid };
  }
  await db.query(
    "UPDATE support_grants SET revoked_at=now() WHERE id=$1 AND restaurant_id=$2",
    [a.grant, a.restaurant],
  );
  await log(db, a.restaurant, user.id, "Accès support révoqué", a.grant);
  return { revoked: true };
}
async function saveActivity(db: DB, restaurant: string, value: { industry: Industry; trade: string; tradeDetail: string }, workProfile?: unknown) {
  await db.query("UPDATE restaurants SET industry=$2,trade=$3,trade_detail=$4,work_profile=coalesce($5::jsonb,work_profile) WHERE id=$1",
    [restaurant,value.industry,value.trade,value.tradeDetail,workProfile === undefined ? null : JSON.stringify(workProfile)]);
}
async function installFreeTradeTools(db: DB, restaurant: string, industry: Industry, previous?: Industry) {
  await db.query("SELECT set_config('app.restaurant_id',$1,true)",[restaurant]);
  if (previous && previous !== industry)
    for (const tool of freeTradeTools[previous]) {
      const entitled=await one<{enabled:boolean}>(db,"SELECT app.addon_entitled($1,$2) AS enabled",[restaurant,tool]);
      if (entitled.enabled) await db.query("SELECT app.addon_installation_set($1,$2,false)",[restaurant,tool]);
    }
  for (const tool of freeTradeTools[industry]) {
    await db.query("SELECT app.addon_install_free($1,$2)",[restaurant,tool]);
    await db.query("SELECT app.addon_installation_set($1,$2,true)",[restaurant,tool]);
  }
}

export async function saveOnboardingDraft(db: DB, user: Actor, raw: unknown) {
  const draft = z.record(z.string(),z.unknown()).parse(raw);
  const serialized = JSON.stringify(draft);
  if (Buffer.byteLength(serialized)>16000) throw new Error("Brouillon trop volumineux.");
  await db.query("INSERT INTO onboarding_drafts(profile_id,draft) VALUES($1,$2::jsonb) ON CONFLICT(profile_id) DO UPDATE SET draft=excluded.draft,updated_at=now()",
    [user.id,serialized]);
  return { saved: true };
}

/** Full referral program for one organisation: summary and monthly leaderboard. */
export async function referralProgram(db: DB, organization: string) {
  const summary = await rows<Record<string, unknown>>(db, "SELECT * FROM app.referral_summary($1)", [
    organization,
  ]);
  if (!summary.length) throw new Error("Administration non autorisée.");
  const billing = await one<Record<string, unknown>>(
    db,
    "SELECT * FROM app.organization_plan($1)",
    [organization],
  );
  const organizationRow = await one<{ name: string }>(
    db,
    "SELECT name FROM organizations WHERE id=$1",
    [organization],
  );
  return {
    organization: { id: organization, name: organizationRow.name, ...billing },
    ...summary[0],
    leaderboard: await rows(
      db,
      "SELECT * FROM app.referral_leaderboard($1)",
      [organization],
    ),
  };
}
