import { rows, one, type DB } from "@/infrastructure/database/db";
import type { Actor } from "@/infrastructure/auth/session";
import { isSuperAdminEmail } from "@/infrastructure/auth/superadmin";
import { oidcConfigured } from "@/infrastructure/auth/oidc";
import { supabaseConfigured } from "@/infrastructure/auth/supabase";
import { probe } from "@/features/ops-security/engine";

export type ComponentHealth = {
  id: string;
  name: string;
  status: "ok" | "degraded" | "down" | "unconfigured";
  message: string;
  latencyMs?: number;
};

export type UserItem = {
  id: string;
  name: string;
  role: string;
  email: string;
  status: string;
};

export type SiteItem = {
  id: string;
  name: string;
  organization_id: string;
  organization_name: string;
  plan: number;
  industry: string;
  trade: string;
  members_count: number;
  orders_count: number;
};

export type SecurityIncidentItem = {
  id: string;
  restaurant_id: string;
  rule_id: string;
  severity: number;
  module: string;
  title: string;
  user_message: string;
  status: string;
  occurrences: number;
  updated_at: string;
};

export type AuditLogItem = {
  id: string;
  restaurant_id: string;
  restaurant_name: string | null;
  actor: string;
  actor_name: string | null;
  action: string;
  object_id: string | null;
  created_at: string;
};

export type SecurityLogItem = {
  id: string;
  severity: number;
  event_type: string;
  module: string;
  action: string;
  actor_id: string | null;
  restaurant_id: string | null;
  status: string;
  error_code: string | null;
  message: string;
  created_at: string;
};

export type SuperAdminDashboardData = {
  timestamp: string;
  currentUser: {
    id: string;
    name: string;
    email?: string;
    role: string;
  };
  metrics: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    totalSites: number;
    totalOrganizations: number;
    openIncidents: number;
    criticalIncidents: number;
    systemState: "Opérationnel" | "Dégradé" | "Incident";
  };
  subsystems: ComponentHealth[];
  usersByRole: { role: string; count: number }[];
  users: UserItem[];
  sites: SiteItem[];
  incidents: SecurityIncidentItem[];
  auditLogs: AuditLogItem[];
  securityLogs: SecurityLogItem[];
};

/**
 * Gatekeeper: Ensures the actor has Super Admin rights.
 */
export async function assertSuperAdmin(db: DB, user: Actor) {
  if (!isSuperAdminEmail(user.email)) {
    throw new Error(
      "Accès refusé : ce tableau de bord et la supervision du monolithe sont réservés exclusivement au compte Super Admin désigné.",
    );
  }
}

/**
 * Gathers complete dashboard data for the Super Admin.
 */
export async function getSuperAdminDashboard(
  db: DB,
  user: Actor,
): Promise<SuperAdminDashboardData> {
  await assertSuperAdmin(db, user);

  // 1. Diagnostics & Probes
  const p = await probe(db).catch(() => ({ ok: false, latencyMs: -1 }));
  const dbHealth: ComponentHealth = {
    id: "database",
    name: "Base de données relationnelle",
    status: !p.ok ? "down" : p.latencyMs > 500 ? "degraded" : "ok",
    message: p.ok
      ? `Opérationnelle (${p.latencyMs} ms de latence)`
      : "Erreur de connexion à la base",
    latencyMs: p.latencyMs,
  };

  // Auth subsystem
  const hasOidc = oidcConfigured();
  const hasSupabase = supabaseConfigured();
  const authHealth: ComponentHealth = {
    id: "auth",
    name: "Service d'authentification",
    status: hasOidc || hasSupabase ? "ok" : "degraded",
    message: hasOidc
      ? "OIDC Enterprise configuré"
      : hasSupabase
        ? "Supabase Auth configuré"
        : "Mode démo / local actif",
  };

  // Stripe / Payments
  const hasStripe =
    !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
  const billingHealth: ComponentHealth = {
    id: "billing",
    name: "Passerelle de paiements (Stripe)",
    status: hasStripe ? "ok" : "unconfigured",
    message: hasStripe
      ? "Clés Stripe et Webhook configurés"
      : "Non configuré (mode démonstration / dev)",
  };

  // Email / Notifications
  const hasEmail = !!process.env.RESEND_API_KEY || !!process.env.EMAIL_FROM;
  const emailHealth: ComponentHealth = {
    id: "email",
    name: "Service de messagerie & e-mails",
    status: hasEmail ? "ok" : "unconfigured",
    message: hasEmail
      ? "Service d'envoi d'e-mails configuré"
      : "Non configuré (envois simulés en local)",
  };

  // Storage / Médias
  const hasS3 = !!process.env.AWS_S3_BUCKET;
  const storageHealth: ComponentHealth = {
    id: "storage",
    name: "Stockage médias & pièces jointes",
    status: hasS3 ? "ok" : "ok",
    message: hasS3
      ? "S3 Bucket externe configuré"
      : "Stockage base / local actif",
  };

  // Outbox / Worker
  const outboxCounts = await rows<{ status: string; count: number }>(
    db,
    "SELECT status, count(*)::int as count FROM outbox_jobs GROUP BY status",
  ).catch(() => []);
  const failedJobs =
    outboxCounts.find((r) => r.status === "failed")?.count ?? 0;
  const pendingJobs =
    outboxCounts.find((r) => r.status === "pending")?.count ?? 0;
  const workerHealth: ComponentHealth = {
    id: "worker",
    name: "File d'attente asynchrone (Outbox)",
    status: failedJobs > 5 ? "degraded" : "ok",
    message:
      failedJobs > 0
        ? `${failedJobs} tâches en échec, ${pendingJobs} en attente`
        : `${pendingJobs} tâche(s) en attente, aucune en échec`,
  };

  const subsystems = [
    dbHealth,
    authHealth,
    billingHealth,
    emailHealth,
    storageHealth,
    workerHealth,
  ];

  // 2. Metrics: Users
  const userStats = await one<{
    total: number;
    active: number;
    suspended: number;
  }>(
    db,
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE status='active')::int AS active, count(*) FILTER (WHERE status='suspended')::int AS suspended FROM profiles",
  ).catch(() => ({ total: 0, active: 0, suspended: 0 }));

  const usersByRole = await rows<{ role: string; count: number }>(
    db,
    "SELECT role, count(*)::int AS count FROM profiles GROUP BY role ORDER BY count DESC",
  ).catch(() => []);

  const users = await rows<UserItem>(
    db,
    "SELECT id, name, role, email, status FROM profiles ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 0 WHEN 'OWNER' THEN 1 ELSE 2 END, name ASC LIMIT 50",
  ).catch(() => []);

  // 3. Metrics: Sites & Organizations
  const siteStats = await one<{ totalSites: number; totalOrgs: number }>(
    db,
    "SELECT (SELECT count(*)::int FROM restaurants WHERE archived_at IS NULL) as totalSites, (SELECT count(*)::int FROM organizations WHERE status='active') as totalOrgs",
  ).catch(() => ({ totalSites: 0, totalOrgs: 0 }));

  const sites = await rows<SiteItem>(
    db,
    `SELECT r.id, r.name, coalesce(r.industry, 'restaurant') as industry, coalesce(r.trade, 'Restaurant') as trade,
            r.organization_id, o.name as organization_name,
            app.restaurant_plan(r.id) as plan,
            (SELECT count(*)::int FROM memberships m WHERE m.restaurant_id=r.id) as members_count,
            (SELECT count(*)::int FROM orders ord WHERE ord.restaurant_id=r.id) as orders_count
     FROM restaurants r
     JOIN organizations o ON o.id=r.organization_id
     WHERE r.archived_at IS NULL
     ORDER BY r.name ASC
     LIMIT 50`,
  ).catch(() => []);

  // 4. Security Incidents
  const incidents = await rows<SecurityIncidentItem>(
    db,
    `SELECT id, restaurant_id, rule_id, severity, module, title, user_message, status, occurrences, updated_at::text
     FROM ops_security_incidents
     WHERE status NOT IN ('auto_resolved', 'manually_resolved')
     ORDER BY severity DESC, updated_at DESC
     LIMIT 50`,
  ).catch(() => []);

  const criticalIncidents = incidents.filter((i) => i.severity >= 5).length;
  const openIncidents = incidents.length;

  // Global state
  const systemState: "Opérationnel" | "Dégradé" | "Incident" =
    !dbHealth.status || dbHealth.status === "down" || criticalIncidents > 0
      ? "Incident"
      : subsystems.some((s) => s.status === "degraded") || openIncidents > 3
        ? "Dégradé"
        : "Opérationnel";

  // 5. Logs (Audit & Ops Security)
  const auditLogs = await rows<AuditLogItem>(
    db,
    `SELECT a.id, a.restaurant_id, r.name as restaurant_name, a.actor, p.name as actor_name, a.action, a.object_id, a.created_at::text
     FROM audit_logs a
     LEFT JOIN restaurants r ON r.id=a.restaurant_id
     LEFT JOIN profiles p ON p.id=a.actor
     ORDER BY a.created_at DESC
     LIMIT 50`,
  ).catch(() => []);

  const securityLogs = await rows<SecurityLogItem>(
    db,
    `SELECT event_id as id, severity, event_type, module, action, actor_id, restaurant_id, status, error_code, message, occurred_at::text as created_at
     FROM ops_security_events
     ORDER BY occurred_at DESC
     LIMIT 50`,
  ).catch(() => []);

  return {
    timestamp: new Date().toISOString(),
    currentUser: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    metrics: {
      totalUsers: userStats.total,
      activeUsers: userStats.active,
      suspendedUsers: userStats.suspended,
      totalSites: siteStats.totalSites,
      totalOrganizations: siteStats.totalOrgs,
      openIncidents,
      criticalIncidents,
      systemState,
    },
    subsystems,
    usersByRole,
    users,
    sites,
    incidents,
    auditLogs,
    securityLogs,
  };
}

/**
 * Performs maintenance actions requested by the Super Admin.
 */
export async function performSuperAdminAction(
  db: DB,
  user: Actor,
  action: {
    type: "resolveIncident" | "toggleUserStatus" | "refreshDiagnostics";
    incidentId?: string;
    profileId?: string;
  },
) {
  await assertSuperAdmin(db, user);

  if (action.type === "resolveIncident" && action.incidentId) {
    await db.query(
      "UPDATE ops_security_incidents SET status='manually_resolved', updated_at=now() WHERE id=$1",
      [action.incidentId],
    );
    return { ok: true, message: "Incident acquitté et résolu." };
  }

  if (action.type === "toggleUserStatus" && action.profileId) {
    const target = await one<UserItem>(
      db,
      "SELECT id, name, role, email, status FROM profiles WHERE id=$1",
      [action.profileId],
    );

    if (
      isSuperAdminEmail(target.email) ||
      target.id === user.id ||
      target.role === "SUPER_ADMIN"
    ) {
      throw new Error(
        "Impossible de modifier le statut d'un compte Super Admin protégé.",
      );
    }

    const nextStatus = target.status === "active" ? "suspended" : "active";
    await db.query("UPDATE profiles SET status=$2 WHERE id=$1", [
      action.profileId,
      nextStatus,
    ]);

    return {
      ok: true,
      status: nextStatus,
      message: `Compte ${target.name} ${nextStatus === "active" ? "activé" : "suspendu"}.`,
    };
  }

  if (action.type === "refreshDiagnostics") {
    return { ok: true, message: "Diagnostic rafraîchi avec succès." };
  }

  throw new Error("Action d'administration inconnue.");
}
