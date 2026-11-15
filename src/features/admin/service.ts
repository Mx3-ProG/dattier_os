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

export type ModuleCheck = {
  id: string;
  name: string;
  status: "ok" | "degraded" | "incident";
  message: string;
  count?: number;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SuperAdminDashboardData = {
  timestamp: string;
  currentUser: {
    id: string;
    name: string;
    email?: string;
    role: string;
  };
  pagination: {
    users: PaginationMeta;
    sites: PaginationMeta;
    logs: PaginationMeta;
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
  moduleChecks: ModuleCheck[];
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
      "Accès refusé : privilèges Super Admin requis pour ce tableau de bord et la supervision du monolithe.",
    );
  }
}

/**
 * Gathers complete dashboard data for the Super Admin.
 */
export type SuperAdminDashboardOptions = {
  usersPage?: number;
  sitesPage?: number;
  logsPage?: number;
  pageSize?: number;
};

export async function getSuperAdminDashboard(
  db: DB,
  user: Actor,
  opts: SuperAdminDashboardOptions = {},
): Promise<SuperAdminDashboardData> {
  await assertSuperAdmin(db, user);

  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 25));
  const usersPage = Math.max(1, opts.usersPage ?? 1);
  const sitesPage = Math.max(1, opts.sitesPage ?? 1);
  const logsPage = Math.max(1, opts.logsPage ?? 1);

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

  const totalUsers = await one<{ c: number }>(
    db,
    "SELECT count(*)::int AS c FROM profiles",
  ).catch(() => ({ c: 0 }));

  const users = await rows<UserItem>(
    db,
    "SELECT id, name, role, email, status FROM profiles ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 0 WHEN 'OWNER' THEN 1 ELSE 2 END, name ASC LIMIT $1 OFFSET $2",
    [pageSize, (usersPage - 1) * pageSize],
  ).catch(() => []);

  // 3. Metrics: Sites & Organizations
  const siteStats = await one<{ totalSites: number; totalOrgs: number }>(
    db,
    "SELECT (SELECT count(*)::int FROM restaurants WHERE archived_at IS NULL) as totalSites, (SELECT count(*)::int FROM organizations WHERE status='active') as totalOrgs",
  ).catch(() => ({ totalSites: 0, totalOrgs: 0 }));

  const totalSitesCount = await one<{ c: number }>(
    db,
    "SELECT count(*)::int AS c FROM restaurants WHERE archived_at IS NULL",
  ).catch(() => ({ c: 0 }));

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
     LIMIT $1 OFFSET $2`,
    [pageSize, (sitesPage - 1) * pageSize],
  ).catch(() => []);

  // 4. Security Incidents
  const totalIncidents = await one<{ c: number }>(
    db,
    "SELECT count(*)::int AS c FROM ops_security_incidents WHERE status NOT IN ('auto_resolved', 'manually_resolved')",
  ).catch(() => ({ c: 0 }));

  const incidents = await rows<SecurityIncidentItem>(
    db,
    `SELECT id, restaurant_id, rule_id, severity, module, title, user_message, status, occurrences, updated_at::text
     FROM ops_security_incidents
     WHERE status NOT IN ('auto_resolved', 'manually_resolved')
     ORDER BY severity DESC, updated_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, (logsPage - 1) * pageSize],
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
  const totalAudit = await one<{ c: number }>(
    db,
    "SELECT count(*)::int AS c FROM audit_logs",
  ).catch(() => ({ c: 0 }));

  const totalSecurity = await one<{ c: number }>(
    db,
    "SELECT count(*)::int AS c FROM ops_security_events",
  ).catch(() => ({ c: 0 }));

  const auditLogs = await rows<AuditLogItem>(
    db,
    `SELECT a.id, a.restaurant_id, r.name as restaurant_name, a.actor, p.name as actor_name, a.action, a.object_id, a.created_at::text
     FROM audit_logs a
     LEFT JOIN restaurants r ON r.id=a.restaurant_id
     LEFT JOIN profiles p ON p.id=a.actor
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, (logsPage - 1) * pageSize],
  ).catch(() => []);

  const securityLogs = await rows<SecurityLogItem>(
    db,
    `SELECT event_id as id, severity, event_type, module, action, actor_id, restaurant_id, status, error_code, message, occurred_at::text as created_at
     FROM ops_security_events
     ORDER BY occurred_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, (logsPage - 1) * pageSize],
  ).catch(() => []);

  // 6. Module coherence checks (inter-module communication)
  const safeCount = async (sql: string) => {
    try {
      const r = await one<{ c: number }>(db, sql);
      return r?.c ?? 0;
    } catch {
      return 0;
    }
  };

  const orphanOrders = await safeCount(
    "SELECT count(*)::int AS c FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id WHERE r.id IS NULL",
  );
  const orphanMemberships = await safeCount(
    "SELECT count(*)::int AS c FROM memberships m LEFT JOIN profiles p ON p.id=m.profile_id LEFT JOIN restaurants r ON r.id=m.restaurant_id WHERE p.id IS NULL OR r.id IS NULL",
  );
  const restaurantsWithoutOrg = await safeCount(
    "SELECT count(*)::int AS c FROM restaurants r LEFT JOIN organizations o ON o.id=r.organization_id WHERE r.archived_at IS NULL AND o.id IS NULL",
  );
  const orphanOrderItems = await safeCount(
    "SELECT count(*)::int AS c FROM order_items oi LEFT JOIN menu_items mi ON mi.id=oi.menu_id WHERE mi.id IS NULL",
  );
  const paidWithoutDeclaration = await safeCount(
    "SELECT count(*)::int AS c FROM orders o WHERE o.status='paid' AND NOT EXISTS (SELECT 1 FROM payment_declarations pd WHERE pd.order_id=o.id)",
  );
  const stockOvercommit = await safeCount(
    "SELECT count(*)::int AS c FROM stock_reservations sr JOIN stock_lots sl ON sl.id=sr.lot_id WHERE sr.quantity > sl.quantity",
  );
  const inactiveProfilesWithMembership = await safeCount(
    "SELECT count(*)::int AS c FROM profiles p JOIN memberships m ON m.profile_id=p.id WHERE p.status<>'active'",
  );
  const securityFailures24h = await safeCount(
    "SELECT count(*)::int AS c FROM ops_security_events WHERE status='failure' AND occurred_at > now() - interval '24 hours'",
  );

  const moduleChecks: ModuleCheck[] = [
    {
      id: "orders-restaurants",
      name: "Commandes ↔ Établissements",
      status: orphanOrders > 0 ? "incident" : "ok",
      message:
        orphanOrders > 0
          ? `${orphanOrders} commande(s) sans établissement valide`
          : "Toutes les commandes sont rattachées à un établissement",
      count: orphanOrders,
    },
    {
      id: "memberships-integrity",
      name: "Membres ↔ Profils/Établissements",
      status: orphanMemberships > 0 ? "incident" : "ok",
      message:
        orphanMemberships > 0
          ? `${orphanMemberships} adhésion(s) orpheline(s)`
          : "Toutes les adhésions sont cohérentes",
      count: orphanMemberships,
    },
    {
      id: "restaurants-orgs",
      name: "Établissements ↔ Organisations",
      status: restaurantsWithoutOrg > 0 ? "degraded" : "ok",
      message:
        restaurantsWithoutOrg > 0
          ? `${restaurantsWithoutOrg} établissement(s) sans organisation active`
          : "Tous les établissements ont une organisation active",
      count: restaurantsWithoutOrg,
    },
    {
      id: "orderitems-menu",
      name: "Lignes de commande ↔ Carte",
      status: orphanOrderItems > 0 ? "degraded" : "ok",
      message:
        orphanOrderItems > 0
          ? `${orphanOrderItems} ligne(s) référençant un plat supprimé`
          : "Toutes les lignes pointent vers la carte",
      count: orphanOrderItems,
    },
    {
      id: "payments-orders",
      name: "Paiements ↔ Commandes",
      status: paidWithoutDeclaration > 5 ? "degraded" : "ok",
      message:
        paidWithoutDeclaration > 0
          ? `${paidWithoutDeclaration} commande(s) payée(s) sans déclaration de paiement`
          : "Paiements cohérents avec les commandes",
      count: paidWithoutDeclaration,
    },
    {
      id: "stock-reservations",
      name: "Réservations de stock ↔ Lots",
      status: stockOvercommit > 0 ? "incident" : "ok",
      message:
        stockOvercommit > 0
          ? `${stockOvercommit} réservation(s) dépassant le lot`
          : "Réservations de stock cohérentes",
      count: stockOvercommit,
    },
    {
      id: "inactive-members",
      name: "Profils inactifs avec accès",
      status: inactiveProfilesWithMembership > 0 ? "degraded" : "ok",
      message:
        inactiveProfilesWithMembership > 0
          ? `${inactiveProfilesWithMembership} profil(s) inactif(s) conservant des droits`
          : "Aucun profil inactif ne conserve d'accès",
      count: inactiveProfilesWithMembership,
    },
    {
      id: "security-failures-24h",
      name: "Événements sécurité en échec (24h)",
      status: securityFailures24h > 10 ? "incident" : securityFailures24h > 0 ? "degraded" : "ok",
      message:
        securityFailures24h > 0
          ? `${securityFailures24h} échec(s) de sécurité dans les 24 dernières heures`
          : "Aucun échec de sécurité récent",
      count: securityFailures24h,
    },
  ];

  const totalLogs = (totalAudit?.c ?? 0) + (totalSecurity?.c ?? 0);

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
    moduleChecks,
    pagination: {
      users: {
        page: usersPage,
        pageSize,
        total: totalUsers?.c ?? 0,
        totalPages: Math.max(1, Math.ceil((totalUsers?.c ?? 0) / pageSize)),
      },
      sites: {
        page: sitesPage,
        pageSize,
        total: totalSitesCount?.c ?? 0,
        totalPages: Math.max(1, Math.ceil((totalSitesCount?.c ?? 0) / pageSize)),
      },
      logs: {
        page: logsPage,
        pageSize,
        total: totalLogs,
        totalPages: Math.max(1, Math.ceil(totalLogs / pageSize)),
      },
    },
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
    const p = await probe(db).catch(() => ({ ok: false, latencyMs: -1 }));
    return {
      ok: true,
      message: p.ok
        ? `Diagnostic rafraîchi : base opérationnelle (${p.latencyMs} ms).`
        : "Diagnostic rafraîchi : base de données injoignable.",
    };
  }

  throw new Error("Action d'administration inconnue.");
}
