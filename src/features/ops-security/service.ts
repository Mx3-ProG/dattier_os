import { z } from "zod";
import type { Database as PGlite } from "@/lib/database/types";
import { one, rows, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { verifyArchives, archivePending, type ArchiveOptions } from "./archive";
import { bufferState, emit, record } from "./events";
import {
  actions,
  detect,
  executeRemediation,
  probe,
  setIncidentStatus,
} from "./engine";
import {
  level,
  openStatuses,
  severities,
  resolutionStatuses,
  type ArchiveRow,
  type Diagnosis,
  type HealthCheck,
  type Metric,
  type Remediation,
  type SecurityEvent,
  type SecurityIncident,
  type SecurityOverview,
} from "./model";

/* ───────────────────────── Access ───────────────────────── */

export type SecurityScope = {
  user: Actor;
  platformAdmin: boolean;
  current: string;
  /** The tenant route is always scoped to the selected establishment. */
  restaurants: string[];
};
/** Server-side gate: membership, then the `security` permission. */
export async function securityScope(
  db: DB,
  user: Actor,
  restaurant: string,
): Promise<SecurityScope> {
  const scoped = await scope(db, user, restaurant);
  requirePermission(scoped.roles ?? scoped.role, "security");
  const platformAdmin = (scoped.roles ?? [scoped.role]).some((role) =>
    ["OWNER", "SUPER_ADMIN"].includes(role),
  );
  const restaurants = [restaurant];
  return { user: scoped, platformAdmin, current: restaurant, restaurants };
}
/**
 * Tenant route: even an owner or platform administrator sees only the selected
 * establishment. Cross-establishment monitoring needs a separate audited route.
 */
function visibility(
  s: SecurityScope,
  column: string,
  params: unknown[],
  filter?: string,
) {
  if (filter && filter !== "all" && filter !== s.current)
    throw new Error("Établissement non autorisé.");
  params.push(s.current);
  return `${column}=$${params.length}`;
}
const redact = <T extends { technical_details?: unknown; context?: unknown }>(
  s: SecurityScope,
  row: T,
): T =>
  s.platformAdmin ? row : { ...row, technical_details: null, context: null };

/* ───────────────────────── Reads ───────────────────────── */

const EVENT_COLUMNS = `e.event_id,e.occurred_at,e.severity,e.event_type,e.module,e.action,e.actor_id,p.name AS actor_name,e.restaurant_id,
 e.session_id,e.correlation_id,e.resource_id,e.status,e.error_code,e.message,e.technical_details,e.resolution_status,e.incident_id`;
export const eventFilters = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  severity: z.enum(severities).optional(),
  minSeverity: z.enum(severities).optional(),
  actor: z.string().max(100).optional(),
  module: z.string().max(40).optional(),
  type: z.string().max(120).optional(),
  scope: z.string().max(100).optional(),
  resolution: z.enum(resolutionStatuses).optional(),
  q: z.string().max(120).optional(),
  incident: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export async function listEvents(db: DB, s: SecurityScope, raw: unknown) {
  const f = eventFilters.parse(raw);
  const params: unknown[] = [];
  const where = [visibility(s, "e.restaurant_id", params, f.scope)];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (f.from) add("e.occurred_at>=?", f.from);
  if (f.to) add("e.occurred_at<=?", f.to);
  if (f.severity) add("e.severity=?", level(f.severity));
  if (f.minSeverity) add("e.severity>=?", level(f.minSeverity));
  if (f.actor) add("e.actor_id=?", f.actor);
  if (f.module) add("e.module=?", f.module);
  if (f.type) add("e.event_type LIKE ?", `${f.type.replace(/[%_]/g, "")}%`);
  if (f.resolution) add("e.resolution_status=?", f.resolution);
  if (f.incident) add("e.incident_id=?", f.incident);
  if (f.q) {
    params.push(`%${f.q.replace(/[%_]/g, "")}%`);
    const n = `$${params.length}`;
    where.push(
      `(e.message ILIKE ${n} OR e.action ILIKE ${n} OR e.event_type ILIKE ${n} OR coalesce(e.error_code,'') ILIKE ${n})`,
    );
  }
  const sql = `SELECT ${EVENT_COLUMNS} FROM ops_security_events e LEFT JOIN profiles p ON p.id=e.actor_id
    WHERE ${where.join(" AND ")} ORDER BY e.occurred_at DESC,e.event_id LIMIT ${f.limit}`;
  return (await rows<SecurityEvent>(db, sql, params)).map((e) => redact(s, e));
}
export async function listIncidents(db: DB, s: SecurityScope, filter?: string) {
  const params: unknown[] = [];
  return (
    await rows<SecurityIncident>(
      db,
      `SELECT id,rule_id,restaurant_id,severity,module,title,user_message,intervention_level,status,occurrences,opened_at,updated_at,resolved_at,resolution_note,context
       FROM ops_security_incidents WHERE ${visibility(s, "restaurant_id", params, filter)}
       ORDER BY CASE WHEN status IN ('auto_resolved','manually_resolved') THEN 1 ELSE 0 END,severity DESC,updated_at DESC LIMIT 200`,
      params,
    )
  ).map((i) => redact(s, i));
}
export async function listRemediations(
  db: DB,
  s: SecurityScope,
  filter?: string,
) {
  const params: unknown[] = [];
  return (
    await rows<Omit<Remediation, "action_label">>(
      db,
      `SELECT r.id,r.incident_id,i.title AS incident_title,r.action,r.intervention_level,r.status,r.attempts,r.max_attempts,r.next_attempt_at,
              r.proposal,r.last_result,r.requested_at,r.executed_at,r.decided_by
       FROM ops_security_remediations r JOIN ops_security_incidents i ON i.id=r.incident_id
       WHERE ${visibility(s, "i.restaurant_id", params, filter)} ORDER BY r.requested_at DESC LIMIT 200`,
      params,
    )
  ).map((r) => ({
    ...r,
    action_label: actions[r.action]?.label ?? r.action,
    last_result: s.platformAdmin
      ? r.last_result
      : r.last_result && "Détail réservé au support technique.",
  }));
}
export async function listArchives(db: DB, s: SecurityScope) {
  return rows<ArchiveRow>(
    db,
    `SELECT to_char(day,'YYYY-MM-DD') AS day,event_count,
       (SELECT count(*)::int FROM jsonb_array_elements(payload) x WHERE x->>'restaurant_id'=$1) AS restaurant_event_count,
       sha256,chain_sha256,created_at,${s.platformAdmin ? "file_path" : "NULL AS file_path"}
     FROM ops_security_archives WHERE restaurant_id=$1 ORDER BY day DESC`,
    [s.current],
  );
}
/** Archive export. A restaurant admin receives only their restaurant's events, without technical details. */
export async function exportArchive(db: DB, s: SecurityScope, day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Date invalide.");
  const a = await one<{
    payload: Record<string, unknown>[];
    sha256: string;
    chain_sha256: string;
  }>(
    db,
    "SELECT payload,sha256,chain_sha256 FROM ops_security_archives WHERE day=$1 AND restaurant_id=$2",
    [day, s.current],
  );
  const events = s.platformAdmin
    ? a.payload
    : a.payload
        .filter((e) => e.restaurant_id === s.current)
        .map((e) => ({ ...e, technical_details: null }));
  await record(db, {
    severity: level("NOTICE"),
    event_type: "archive.exported",
    module: "security",
    action: `Export de l’archive du ${day}`,
    message: `Archive du ${day} exportée (${events.length} événements).`,
    actor_id: s.user.id,
    restaurant_id: s.platformAdmin ? null : s.current,
    resource_id: day,
    status: "success",
  });
  return {
    day,
    sha256: a.sha256,
    chain_sha256: a.chain_sha256,
    partial: !s.platformAdmin,
    events,
  };
}

/* ───────────────────────── Overview ───────────────────────── */

const minutesAgo = (iso: string | null) =>
  iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity;
async function healthChecks(db: DB, s: SecurityScope): Promise<HealthCheck[]> {
  const p = await probe(db);
  const b = bufferState();
  const scheduled = await rows<{ last_tick: string | null }>(
    db,
    "SELECT max(completed_at)::text AS last_tick FROM outbox_jobs WHERE restaurant_id=$1 AND kind='security_scan' AND status='done'",
    [s.current],
  );
  const sched = {
    running: !!scheduled[0]?.last_tick,
    lastTick: scheduled[0]?.last_tick || null,
  };
  const verify = await rows<{ status: string; finished_at: string }>(
    db,
    "SELECT status,finished_at FROM ops_security_jobs WHERE job='verify' ORDER BY finished_at DESC LIMIT 1",
  );
  const emailErrors = (
    await one<{ n: number }>(
      db,
      "SELECT count(*)::int AS n FROM customer_email_outbox o JOIN customers c ON c.id=o.customer_id WHERE o.status='error' AND o.created_at>now()-interval '24 hours' AND c.restaurant_id=$1",
      [s.current],
    )
  ).n;
  const stripe =
    !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
  const resend = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
  return [
    {
      id: "database",
      label: "Base de données",
      state: !p.ok ? "down" : p.latencyMs > 750 ? "degraded" : "ok",
      detail: p.ok
        ? `Réponse en ${p.latencyMs} ms`
        : "Requête de contrôle en échec",
    },
    {
      id: "journal",
      label: "Écriture du journal",
      state: b.pending ? "degraded" : "ok",
      detail: b.pending
        ? `${b.pending} événement(s) en attente`
        : "Écriture immédiate",
    },
    {
      id: "scheduler",
      label: "Tâches planifiées",
      state: !sched.running
        ? "down"
        : minutesAgo(sched.lastTick) > 5
          ? "degraded"
          : "ok",
      detail: !sched.running
        ? "Aucun passage du worker enregistré pour cet établissement"
        : sched.lastTick
          ? `Dernier passage il y a ${Math.round(minutesAgo(sched.lastTick))} min`
          : "Premier passage en attente",
    },
    {
      id: "archives",
      label: "Intégrité des archives",
      state: !verify[0]
        ? "unmonitored"
        : verify[0].status === "failure"
          ? "down"
          : "ok",
      detail: !verify[0]
        ? "Aucune vérification exécutée"
        : verify[0].status === "failure"
          ? "Altération détectée"
          : `Vérifiées le ${new Date(verify[0].finished_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`,
    },
    {
      id: "payments",
      label: "Paiement en ligne (Stripe)",
      state: stripe ? "unmonitored" : "not_configured",
      detail: stripe
        ? "Configuré · disponibilité non sondée (échecs relevés à l’usage)"
        : "Non configuré sur cette installation",
    },
    {
      id: "email",
      label: "E-mails clients",
      state: emailErrors
        ? "degraded"
        : resend
          ? "unmonitored"
          : "not_configured",
      detail: emailErrors
        ? `${emailErrors} envoi(s) en échec sur 24 h`
        : resend
          ? "Configuré · échecs relevés à l’usage"
          : "Mode aperçu local, aucun envoi réel",
    },
    {
      id: "kitchen",
      label: "Affichage cuisine",
      state: "unmonitored",
      detail:
        "Projection de la base relue par les écrans ; pas de canal réseau dédié à surveiller",
    },
  ];
}
export async function overview(
  db: DB,
  s: SecurityScope,
): Promise<SecurityOverview> {
  const safe = async (fn: () => Promise<Metric>): Promise<Metric> => {
    try {
      return await fn();
    } catch {
      return { available: false, reason: "Données indisponibles" };
    }
  };
  const health = await healthChecks(db, s).catch(() => [] as HealthCheck[]);
  const settings = await one<{
    remediation_mode: "observation" | "active";
    retention_days: number;
  }>(
    db,
    "SELECT remediation_mode,retention_days FROM ops_security_settings WHERE restaurant_id=coalesce(nullif(current_setting('app.restaurant_id',true),''),restaurant_id) LIMIT 1",
  );
  const incidentCount = async (min: number, max: number) => {
    const params: unknown[] = [];
    const v = visibility(s, "restaurant_id", params);
    params.push(openStatuses, min, max);
    return (
      await one<{ n: number }>(
        db,
        `SELECT count(*)::int AS n FROM ops_security_incidents WHERE ${v} AND status=ANY($${params.length - 2}) AND severity BETWEEN $${params.length - 1} AND $${params.length}`,
        params,
      )
    ).n;
  };
  const monitored = health.filter((h) =>
    ["ok", "degraded", "down"].includes(h.state),
  );
  const down = health.filter((h) => h.state === "down");
  return {
    platformAdmin: s.platformAdmin,
    restaurant: s.current,
    mode: settings.remediation_mode,
    retentionDays: settings.retention_days,
    generatedAt: new Date().toISOString(),
    health,
    pendingBuffer: bufferState().pending,
    metrics: {
      system: monitored.length
        ? {
            available: true,
            value: down.length
              ? "Incident"
              : monitored.some((h) => h.state === "degraded")
                ? "Dégradé"
                : "Opérationnel",
            detail: `${monitored.filter((h) => h.state === "ok").length}/${monitored.length} composants surveillés conformes`,
          }
        : { available: false, reason: "Données indisponibles" },
      critical: await safe(async () => ({
        available: true,
        value: await incidentCount(6, 6),
        detail: "Incidents critiques ouverts",
      })),
      warnings: await safe(async () => ({
        available: true,
        value: await incidentCount(4, 5),
        detail: "Anomalies et erreurs ouvertes",
      })),
      recent: await safe(async () => {
        const params: unknown[] = [];
        const v = visibility(s, "restaurant_id", params);
        const r = await one<{ n: number; w: number }>(
          db,
          `SELECT count(*)::int AS n,count(*) FILTER (WHERE severity>=4)::int AS w FROM ops_security_events WHERE ${v} AND occurred_at>now()-interval '24 hours'`,
          params,
        );
        return {
          available: true,
          value: r.n,
          detail: `dont ${r.w} avertissement(s) ou plus · 24 h`,
        };
      }),
      remediations: await safe(async () => {
        const params: unknown[] = [];
        const v = visibility(s, "i.restaurant_id", params);
        const r = await one<{ ok: number; ko: number; observed: number }>(
          db,
          `SELECT count(*) FILTER (WHERE r.status='succeeded')::int AS ok,count(*) FILTER (WHERE r.status IN ('abandoned','failed'))::int AS ko,
                  count(*) FILTER (WHERE r.status='observed')::int AS observed
           FROM ops_security_remediations r JOIN ops_security_incidents i ON i.id=r.incident_id WHERE ${v} AND r.requested_at>now()-interval '15 days'`,
          params,
        );
        return {
          available: true,
          value: `${r.ok} / ${r.ko}`,
          detail:
            settings.remediation_mode === "observation"
              ? `Réussies / échouées · mode observation (${r.observed} non exécutée(s))`
              : "Réussies / échouées · 15 jours",
        };
      }),
      sessions: await safe(async () => {
        const count = await one<{ n: number }>(
          db,
          "SELECT count(DISTINCT profile_id)::int AS n FROM ops_auth_presence WHERE restaurant_id=$1 AND last_seen>now()-interval '15 minutes'",
          [s.current],
        );
        return {
          available: true,
          value: count.n,
          detail:
            "Comptes ayant eu une activité authentifiée sur les 15 dernières minutes",
        };
      }),
      lastArchive: await safe(async () => {
        const a = await rows<{ day: string; event_count: number }>(
          db,
          "SELECT to_char(day,'YYYY-MM-DD') AS day,event_count FROM ops_security_archives ORDER BY day DESC LIMIT 1",
        );
        const failed = await rows(
          db,
          "SELECT 1 FROM ops_security_jobs WHERE job='archive' AND status='failure' AND finished_at>now()-interval '24 hours'",
        );
        if (!a[0])
          return {
            available: true,
            value: "Aucune",
            detail: failed.length
              ? "Dernier archivage en échec"
              : "Première archive après minuit",
          };
        const integrity = health.find((h) => h.id === "archives");
        return {
          available: true,
          value: new Date(`${a[0].day}T12:00:00Z`).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
          }),
          detail: `${failed.length ? "Échec récent · " : ""}${integrity?.state === "down" ? "altération détectée" : integrity?.state === "ok" ? "intégrité vérifiée" : "non vérifiée"}`,
        };
      }),
      unavailable: monitored.length
        ? {
            available: true,
            value: down.length,
            detail: down.length
              ? down.map((d) => d.label).join(", ")
              : "Aucune indisponibilité confirmée",
          }
        : { available: false, reason: "Non surveillé" },
    },
  };
}

/* ───────────────────────── Diagnosis ───────────────────────── */

type Knowledge = { causes: [string, boolean][]; checks: string[] };
const knowledge: Record<string, Knowledge> = {
  "auth.login.failure": {
    causes: [
      ["Identifiants erronés saisis par un utilisateur légitime.", false],
      ["Essais automatisés de mots de passe.", false],
    ],
    checks: [
      "Comparer l’origine (empreinte client) des échecs.",
      "Demander à l’équipe si quelqu’un a eu des difficultés à se connecter.",
      "Consulter la règle « Tentatives de connexion répétées ».",
    ],
  },
  "access.denied": {
    causes: [
      ["Profil utilisant une fonction non prévue pour son rôle.", false],
      ["Exploration des droits avec une session détournée.", false],
    ],
    checks: [
      "Vérifier le rôle du profil dans l’établissement.",
      "Comparer avec le planning : le profil était-il en service ?",
    ],
  },
  "access.denied.external": {
    causes: [
      ["Compte d’un autre établissement qui suit un lien erroné.", false],
      ["Exploration volontaire d’identifiants d’établissement.", false],
    ],
    checks: [
      "Regarder si l’empreinte source revient et combien de tentatives elle cumule.",
      "Donner l’empreinte au support de la plateforme, seul à pouvoir retrouver le compte.",
    ],
  },
  "payment.provider.unreachable": {
    causes: [
      ["Indisponibilité ou lenteur du service Stripe.", false],
      ["Coupure de la connexion Internet du serveur.", false],
      ["Clé de test invalide ou révoquée.", false],
    ],
    checks: [
      "Consulter la page d’état de Stripe.",
      "Vérifier la connexion réseau du serveur.",
      "Le client peut relancer le paiement depuis son suivi ; la commande n’est pas dupliquée (clé d’idempotence Stripe).",
    ],
  },
  "payment.provider.not_configured": {
    causes: [
      [
        "Les variables STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET ne sont pas définies.",
        true,
      ],
    ],
    checks: [
      "Configurer les clés de test côté serveur si le paiement en ligne est souhaité.",
    ],
  },
  "webhook.signature.rejected": {
    causes: [
      ["Secret du webhook différent de celui de Stripe.", false],
      ["Notification forgée par un tiers.", false],
      ["Horloge du serveur décalée de plus de 5 minutes.", false],
    ],
    checks: [
      "Comparer le secret whsec avec la commande « stripe listen ».",
      "Vérifier l’heure du serveur.",
    ],
  },
  "database.constraint": {
    causes: [
      [
        "Deux opérations concurrentes sur la même donnée ; la base a refusé la seconde.",
        false,
      ],
      ["Donnée incohérente envoyée par l’interface.", false],
    ],
    checks: [
      "Rejouer l’opération depuis l’interface.",
      "Contrôler qu’aucune donnée n’a été enregistrée en double.",
    ],
  },
  "database.error": {
    causes: [
      ["Requête incompatible avec le schéma (migration manquante).", false],
      ["Base locale verrouillée par un autre processus.", false],
    ],
    checks: [
      "Vérifier qu’un seul processus utilise le dossier de données.",
      "Consulter la version de schéma (schema_versions).",
    ],
  },
  "application.error": {
    causes: [["Défaut logiciel non anticipé.", false]],
    checks: [
      "Consulter la pile technique dans le détail.",
      "Reproduire le parcours sur une base de test.",
    ],
  },
  "system.database.unavailable": {
    causes: [["Mode démo désactivé ou dossier de données invalide.", false]],
    checks: [
      "Vérifier ATACUISINE_DEMO et ATACUISINE_DATA_DIR.",
      "Redémarrer le serveur local.",
    ],
  },
  "archive.failed": {
    causes: [
      ["Échec d’écriture (disque plein, droits du dossier d’archives).", false],
    ],
    checks: [
      "Vérifier l’espace disque et les droits du dossier d’archives.",
      "Une nouvelle tentative automatique est prévue si le mode actif est activé.",
    ],
  },
  "archive.integrity.violation": {
    causes: [
      ["Modification directe de la base ou du fichier d’archive.", false],
      ["Corruption du support de stockage.", false],
    ],
    checks: [
      "Ne rien corriger : préserver la base et les fichiers.",
      "Comparer avec une sauvegarde indépendante.",
      "Identifier qui disposait d’un accès direct au serveur.",
    ],
  },
  "retention.blocked": {
    causes: [["Un jour ancien n’a jamais été archivé.", true]],
    checks: ["Relancer l’archivage manquant."],
  },
  "operation.refused": {
    causes: [
      [
        "Une règle métier a refusé l’opération (message affiché à l’utilisateur).",
        true,
      ],
    ],
    checks: ["Aucune action technique : vérifier les données saisies."],
  },
  "request.invalid": {
    causes: [["Données envoyées non conformes au format attendu.", true]],
    checks: ["Aucune action technique sauf répétition anormale."],
  },
  "request.origin.rejected": {
    causes: [
      [
        "Appel provenant d’un autre site (tentative CSRF) ou d’un outil externe.",
        false,
      ],
    ],
    checks: ["Vérifier qu’aucune intégration légitime n’appelle l’API."],
  },
};
const ruleKnowledge: Record<string, Knowledge> = {
  journal_buffer: {
    causes: [["Écriture en base momentanément impossible.", false]],
    checks: ["Vérifier l’état « Base de données »."],
  },
  archive_missing: {
    causes: [
      ["Le serveur était arrêté pendant la fenêtre nocturne.", false],
      ["Échec de la tâche d’archivage.", false],
    ],
    checks: ["Consulter les tâches d’archivage."],
  },
  database_slow: {
    causes: [["Charge ponctuelle ou disque lent.", false]],
    checks: ["Surveiller les prochains contrôles."],
  },
};
export async function diagnose(
  db: DB,
  s: SecurityScope,
  eventId: string,
): Promise<Diagnosis> {
  const params: unknown[] = [eventId];
  const event = await one<SecurityEvent>(
    db,
    `SELECT ${EVENT_COLUMNS} FROM ops_security_events e LEFT JOIN profiles p ON p.id=e.actor_id WHERE e.event_id=$1 AND ${visibility(s, "e.restaurant_id", params)}`,
    params,
  );
  const incident = event.incident_id
    ? ((await listIncidents(db, s)).find((i) => i.id === event.incident_id) ??
      null)
    : null;
  // Same-type grouping only for anomalies: normal activity of other users is not "correlated".
  const p2: unknown[] = [
    event.correlation_id,
    event.incident_id,
    event.resource_id,
    event.occurred_at,
    event.module,
    event.event_type,
    event.severity,
  ];
  const timeline = await rows<SecurityEvent>(
    db,
    `SELECT ${EVENT_COLUMNS} FROM ops_security_events e LEFT JOIN profiles p ON p.id=e.actor_id
     WHERE ${visibility(s, "e.restaurant_id", p2)} AND (
       ($1::text IS NOT NULL AND e.correlation_id=$1) OR ($2::text IS NOT NULL AND e.incident_id=$2)
       OR ($3::text IS NOT NULL AND e.resource_id=$3 AND e.occurred_at BETWEEN $4::timestamptz-interval '30 minutes' AND $4::timestamptz+interval '30 minutes')
       OR ($7::int>=4 AND e.module=$5 AND e.event_type=$6 AND e.occurred_at BETWEEN $4::timestamptz-interval '15 minutes' AND $4::timestamptz+interval '15 minutes'))
     ORDER BY e.occurred_at,e.event_id LIMIT 100`,
    p2,
  );
  const k =
    knowledge[event.event_type] ??
    (incident && ruleKnowledge[incident.rule_id]) ??
    (incident
      ? {
          causes: [
            [
              "Cause non déterminée : la règle a constaté le symptôme, pas son origine.",
              false,
            ],
          ],
          checks: ["Ouvrir les événements de la chronologie un par un."],
        }
      : {
          causes: [
            [
              "Événement d’activité normale : aucune anomalie à diagnostiquer.",
              event.severity <= 3,
            ],
          ],
          checks: [],
        });
  const remediations = event.incident_id
    ? (await listRemediations(db, s)).filter(
        (r) => r.incident_id === event.incident_id,
      )
    : [];
  await record(db, {
    severity: level("INFO"),
    event_type: "security.analysis",
    module: "security",
    action: "Analyse d’incident consultée",
    message: `Analyse de l’événement ${event.event_type}.`,
    actor_id: s.user.id,
    restaurant_id: event.restaurant_id,
    resource_id: event.event_id,
  });
  return {
    event: redact(s, event),
    timeline: timeline.map((e) => redact(s, e)),
    components: [...new Set(timeline.map((e) => e.module))],
    causes: k.causes.map(([text, confirmed]) => ({ text, confirmed })),
    checks: k.checks,
    remediations,
    incident,
    status:
      incident?.status ??
      event.resolution_status ??
      (event.severity >= 4 ? "detected" : "none"),
  };
}

/* ───────────────────────── Writes ───────────────────────── */

export const securityActionSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("incidentStatus"),
    id: z.string().min(1),
    status: z.enum(["analyzing", "manually_resolved"]),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({ op: z.literal("approve"), id: z.string().min(1) }),
  z.object({
    op: z.literal("reject"),
    id: z.string().min(1),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({ op: z.literal("mode"), mode: z.enum(["observation", "active"]) }),
  z.object({
    op: z.literal("run"),
    job: z.enum(["detect", "verify", "archive"]),
  }),
]);
const platformOnly = (s: SecurityScope) => {
  if (!s.platformAdmin)
    throw new Error(
      "Action réservée au administrateur autorisé du restaurant : accès refusé.",
    );
};
export async function securityAction(
  db: PGlite,
  s: SecurityScope,
  raw: unknown,
  archive: ArchiveOptions = {},
) {
  const a = securityActionSchema.parse(raw);
  switch (a.op) {
    case "incidentStatus": {
      const visible = (await listIncidents(db, s)).find((i) => i.id === a.id);
      if (!visible) throw new Error("Incident non autorisé.");
      if (a.status === "manually_resolved" && !a.note)
        throw new Error("Décrivez l’intervention réalisée.");
      await db.transaction((tx) =>
        setIncidentStatus(
          tx,
          a.id,
          a.status,
          s.user.id,
          a.note || "Analyse en cours par un administrateur.",
          true,
        ),
      );
      return { ok: true };
    }
    case "approve":
    case "reject": {
      platformOnly(s);
      const r = await one<{
        status: string;
        incident_id: string;
        action: string;
      }>(
        db,
        "SELECT status,incident_id,action FROM ops_security_remediations WHERE id=$1 FOR UPDATE",
        [a.id],
      );
      if (r.status !== "awaiting_approval")
        throw new Error("Cette action n’attend pas d’autorisation.");
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE ops_security_remediations SET decided_by=$2,decided_at=clock_timestamp(),status=$3 WHERE id=$1",
          [a.id, s.user.id, a.op === "approve" ? "scheduled" : "rejected"],
        );
        await emit(tx, {
          severity: level("NOTICE"),
          event_type:
            a.op === "approve"
              ? "remediation.approved"
              : "remediation.rejected",
          module: "security",
          action: `${a.op === "approve" ? "Autorisation" : "Refus"} : ${actions[r.action]?.label ?? r.action}`,
          message:
            a.op === "approve"
              ? "Intervention sensible autorisée par le administrateur autorisé du restaurant."
              : `Intervention refusée${"note" in a && a.note ? ` : ${a.note}` : ""}.`,
          actor_id: s.user.id,
          incident_id: r.incident_id,
          resource_id: a.id,
          status: "success",
        });
      });
      if (a.op === "reject") return { ok: true };
      return executeRemediation(db, a.id, { archive, actor: s.user.id });
    }
    case "mode":
      platformOnly(s);
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE ops_security_settings SET remediation_mode=$1,updated_at=now(),updated_by=$2",
          [a.mode, s.user.id],
        );
        await emit(tx, {
          severity: level("NOTICE"),
          event_type: "security.settings.changed",
          module: "security",
          action: `Mode de correction : ${a.mode}`,
          message:
            a.mode === "active"
              ? "Corrections automatiques sûres (niveau A) activées."
              : "Mode observation : les corrections sont détectées mais non exécutées.",
          actor_id: s.user.id,
          status: "success",
        });
      });
      return { ok: true };
    case "run": {
      platformOnly(s);
      await record(db, {
        severity: level("NOTICE"),
        event_type: "security.job.manual",
        module: "security",
        action: `Exécution manuelle : ${a.job}`,
        message: `Tâche « ${a.job} » lancée manuellement.`,
        actor_id: s.user.id,
      });
      if (a.job === "verify") return verifyArchives(db);
      if (a.job === "archive") return archivePending(db, archive);
      return { opened: await detect(db) };
    }
  }
}
