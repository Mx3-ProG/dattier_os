import { randomUUID } from "node:crypto";
import type { Database as PGlite } from "@/infrastructure/database/types";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { databaseContext } from "@/infrastructure/database/context";
import { notify } from "@/features/orders/service";
import {
  archiveDay,
  archivePending,
  missingArchiveDays,
  parisToday,
  purgeExpired,
  verifyArchives,
  type ArchiveOptions,
} from "./archive";
import { bufferState, emit, flushBuffer, record } from "./events";
import { runWithContext } from "./context";
import { level, type ResolutionStatus, type SeverityName } from "./model";

/* ───────────────────────── Incidents ───────────────────────── */

export type Detection = {
  fingerprint: string;
  restaurant_id: string | null;
  severity: SeverityName;
  module: string;
  title: string;
  user_message: string;
  context: Record<string, unknown>;
};
async function restaurantExists(db: DB, id: string | null) {
  return (
    !!id &&
    (await rows(db, "SELECT 1 FROM restaurants WHERE id=$1", [id])).length > 0
  );
}
export async function openIncident(db: DB, rule: Rule, d: Detection) {
  const existing = await rows<{ id: string }>(
    db,
    "SELECT id FROM ops_security_incidents WHERE restaurant_id=current_setting('app.restaurant_id',true) AND fingerprint=$1 AND status NOT IN ('auto_resolved','manually_resolved')",
    [`${databaseContext.getStore()?.restaurantId}:${d.fingerprint}`],
  );
  if (existing[0]) {
    await db.query(
      "UPDATE ops_security_incidents SET occurrences=occurrences+1,updated_at=clock_timestamp(),context=$2 WHERE id=$1",
      [existing[0].id, JSON.stringify(d.context)],
    );
    return { id: existing[0].id, created: false };
  }
  const id = randomUUID();
  await db.query(
    `INSERT INTO ops_security_incidents(id,fingerprint,rule_id,restaurant_id,severity,module,title,user_message,intervention_level,context)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      `${databaseContext.getStore()?.restaurantId}:${d.fingerprint}`,
      rule.id,
      d.restaurant_id ?? databaseContext.getStore()?.restaurantId,
      level(d.severity),
      d.module,
      d.title,
      d.user_message,
      rule.level,
      JSON.stringify(d.context),
    ],
  );
  await record(db, {
    severity: level(d.severity),
    event_type: "incident.detected",
    module: d.module,
    action: `Incident détecté : ${d.title}`,
    message: d.user_message,
    restaurant_id: d.restaurant_id,
    incident_id: id,
    resolution_status: "detected",
    status: "failure",
    error_code: rule.id.toUpperCase(),
    details: { rule: rule.id, level: rule.level, ...d.context },
  });
  if (
    level(d.severity) >= level("ERROR") &&
    (await restaurantExists(db, d.restaurant_id))
  )
    await notify(db, d.restaurant_id!, `Sécurité · ${d.title}`);
  return { id, created: true };
}
export async function setIncidentStatus(
  db: DB,
  id: string,
  status: ResolutionStatus,
  by: string | null,
  note: string,
  strict = false,
) {
  const incident = await one<{
    restaurant_id: string | null;
    module: string;
    title: string;
    severity: number;
    status: string;
  }>(
    db,
    "SELECT restaurant_id,module,title,severity,status FROM ops_security_incidents WHERE id=$1 FOR UPDATE",
    [id],
  );
  if (incident.status === status) return;
  const resolved = status === "auto_resolved" || status === "manually_resolved";
  await db.query(
    `UPDATE ops_security_incidents SET status=$2,updated_at=clock_timestamp(),
       resolved_at=${resolved ? "clock_timestamp()" : "NULL"},resolved_by=$3,resolution_note=$4 WHERE id=$1`,
    [id, status, resolved ? by : null, note || null],
  );
  const input = {
    severity: resolved
      ? level("INFO")
      : status === "intervention_required"
        ? Math.max(incident.severity, level("WARNING"))
        : level("INFO"),
    event_type: `incident.${status}`,
    module: incident.module,
    action: `Incident « ${incident.title} » : ${status}`,
    message: note || incident.title,
    actor_id: by,
    restaurant_id: incident.restaurant_id,
    incident_id: id,
    resolution_status: status,
    status: resolved ? ("success" as const) : ("info" as const),
  };
  if (strict) await emit(db, input);
  else await record(db, input);
  if (
    status === "intervention_required" &&
    (await restaurantExists(db, incident.restaurant_id))
  )
    await notify(
      db,
      incident.restaurant_id!,
      `Sécurité · intervention nécessaire : ${incident.title}`,
    );
}

/* ───────────────────────── Remediation actions ───────────────────────── */

export type ActionContext = {
  incidentId: string;
  context: Record<string, unknown>;
  archive: ArchiveOptions;
  actor?: string | null;
};
export type RemediationAction = {
  id: string;
  level: "A" | "B";
  label: string;
  proposal: (ctx: Record<string, unknown>) => Record<string, string>;
  /** Must be idempotent. Throws on failure; returns a human-readable result. */
  run: (db: PGlite, ctx: ActionContext) => Promise<string>;
};
export const actions: Record<string, RemediationAction> = {
  retry_archive: {
    id: "retry_archive",
    level: "A",
    label: "Relancer l’archivage manquant",
    proposal: () => ({
      problem: "Une ou plusieurs archives quotidiennes manquent.",
      cause: "Échec ou non-exécution de la tâche nocturne (hypothèse).",
      action:
        "Recréer les archives manquantes. Une archive existante n’est jamais réécrite.",
      risks: "Aucun : opération idempotente, lecture seule des événements.",
      consequences:
        "Les jours concernés redeviennent vérifiables et purgeables.",
      expected:
        "Archive créée et empreinte enregistrée pour chaque jour manquant.",
    }),
    async run(db, ctx) {
      const extra = Array.isArray(ctx.context.blocked)
        ? (ctx.context.blocked as string[])
        : [];
      const results = [...(await archivePending(db, ctx.archive))];
      for (const day of extra)
        results.push({ day, ...(await archiveDay(db, day, ctx.archive)) });
      const failed = results.filter((r) => r.status === "failed");
      if (failed.length)
        throw new Error(
          `Archivage toujours en échec pour ${failed.map((f) => f.day).join(", ")}`,
        );
      return `${results.filter((r) => r.status === "created").length} archive(s) créée(s).`;
    },
  },
  flush_log_buffer: {
    id: "flush_log_buffer",
    level: "A",
    label: "Réinjecter les événements en attente",
    proposal: () => ({
      problem: "Des événements n’ont pas pu être écrits dans le journal.",
      cause: "Indisponibilité temporaire de l’écriture en base (hypothèse).",
      action:
        "Réécrire les événements conservés en mémoire, sans doublon (identifiant unique).",
      risks: "Aucun : insertion idempotente.",
      consequences: "Le journal redevient complet.",
      expected: "Tampon vide.",
    }),
    async run(db) {
      let total = 0;
      for (let i = 0; i < 10 && bufferState().pending; i++)
        total += await flushBuffer(db);
      if (bufferState().pending)
        throw new Error(
          `${bufferState().pending} événement(s) toujours en attente`,
        );
      return `${total} événement(s) réinjecté(s).`;
    },
  },
  revoke_actor_sessions: {
    id: "revoke_actor_sessions",
    level: "B",
    label: "Révoquer les sessions du profil concerné",
    proposal: (ctx) => ({
      problem: `Le profil « ${String(ctx.actor ?? "?")} » enchaîne des accès refusés.`,
      cause:
        "Hypothèses : sondage des droits par un tiers ayant obtenu la session, ou interface mal configurée. Non confirmé.",
      action:
        "Révoquer les accès de la session à cet établissement ; les autres organisations restent indépendantes.",
      risks:
        "Le membre de l’équipe est déconnecté, y compris pendant un service.",
      consequences:
        "Il devra se reconnecter ; aucune donnée métier ni permission n’est modifiée.",
      expected:
        "Les anciennes sessions ne peuvent plus accéder à cet établissement.",
    }),
    async run(db, ctx) {
      const actor = String(ctx.context.actor ?? "");
      if (!actor) throw new Error("Profil non identifié.");
      return db.transaction(async (tx) => {
        await one(
          tx,
          "SELECT p.id FROM profiles p JOIN memberships m ON m.profile_id=p.id WHERE p.id=$1 AND m.restaurant_id=$2",
          [actor, databaseContext.getStore()?.restaurantId],
        );
        const r = await tx.query(
          "INSERT INTO restaurant_session_revocations(restaurant_id,profile_id,not_before) VALUES($1,$2,now()) ON CONFLICT(restaurant_id,profile_id) DO UPDATE SET not_before=excluded.not_before",
          [databaseContext.getStore()?.restaurantId, actor],
        );
        await emit(tx, {
          severity: level("NOTICE"),
          event_type: "auth.sessions.revoked",
          module: "auth",
          action: "Sessions révoquées après autorisation",
          message: `Les sessions du profil ${actor} ont été révoquées.`,
          actor_id: ctx.actor ?? null,
          resource_id: actor,
          incident_id: ctx.incidentId,
          status: "success",
        });
        return `${r.affectedRows ?? 0} session(s) révoquée(s).`;
      });
    },
  },
};

/* ───────────────────────── Detection rules ───────────────────────── */

export type Rule = {
  id: string;
  level: "A" | "B" | "C";
  label: string;
  /** Rules whose condition can disappear on its own close their incidents automatically. */
  autoClose: boolean;
  remediation?: string;
  detect: (db: PGlite) => Promise<Detection[]>;
};
const health = globalThis as unknown as {
  atacuisineOpsSecurityProbe?: { at: string; latencyMs: number; ok: boolean };
};
export const lastProbe = () => health.atacuisineOpsSecurityProbe ?? null;
export const rules: Rule[] = [
  {
    id: "auth_repeated_failures",
    level: "C",
    label: "Tentatives de connexion répétées",
    autoClose: false,
    detect: async (db) =>
      (
        await rows<{ restaurant_id: string | null; client: string; n: number }>(
          db,
          `SELECT restaurant_id,coalesce(technical_details->>'client','inconnu') AS client,count(*)::int AS n FROM ops_security_events
           WHERE event_type='auth.login.failure' AND occurred_at>now()-interval '15 minutes' GROUP BY 1,2 HAVING count(*)>=5`,
        )
      ).map((r) => ({
        fingerprint: `auth_repeated_failures:${r.restaurant_id ?? "global"}:${r.client}`,
        restaurant_id: r.restaurant_id,
        severity: "WARNING",
        module: "auth",
        title: "Tentatives de connexion répétées",
        user_message: `${r.n} échecs de connexion en 15 minutes depuis la même origine. Vérifiez qu’il s’agit bien d’un membre de l’équipe ou d’un client.`,
        context: { client: r.client, failures: r.n },
      })),
  },
  {
    id: "error_burst",
    level: "C",
    label: "Erreurs répétées sur un module",
    autoClose: false,
    detect: async (db) =>
      (
        await rows<{
          restaurant_id: string | null;
          module: string;
          n: number;
          codes: string[];
        }>(
          db,
          `SELECT restaurant_id,module,count(*)::int AS n,array_agg(DISTINCT coalesce(error_code,'?')) AS codes FROM ops_security_events
           WHERE severity>=5 AND incident_id IS NULL AND event_type NOT LIKE 'archive.%' AND event_type NOT LIKE 'retention.%'
             AND occurred_at>now()-interval '10 minutes' GROUP BY 1,2 HAVING count(*)>=3`,
        )
      ).map((r) => ({
        fingerprint: `error_burst:${r.restaurant_id ?? "global"}:${r.module}`,
        restaurant_id: r.restaurant_id,
        severity: "ERROR",
        module: r.module,
        title: "Erreurs répétées",
        user_message: `${r.n} erreurs techniques en 10 minutes sur ce module. Cause non diagnostiquée : intervention humaine requise.`,
        context: { errors: r.n, codes: r.codes },
      })),
  },
  {
    id: "access_denied_burst",
    level: "B",
    label: "Accès refusés en série",
    autoClose: false,
    remediation: "revoke_actor_sessions",
    detect: async (db) =>
      (
        await rows<{ actor_id: string; n: number }>(
          db,
          `SELECT actor_id,count(*)::int AS n FROM ops_security_events WHERE event_type='access.denied' AND actor_id IS NOT NULL
           AND occurred_at>now()-interval '10 minutes' GROUP BY 1 HAVING count(*)>=10`,
        )
      ).map((r) => ({
        fingerprint: `access_denied_burst:${r.actor_id}`,
        restaurant_id: null,
        severity: "WARNING",
        module: "security",
        title: "Accès refusés en série",
        user_message: `Le profil ${r.actor_id} a reçu ${r.n} refus d’accès en 10 minutes.`,
        context: { actor: r.actor_id, denied: r.n },
      })),
  },
  {
    id: "archive_missing",
    level: "A",
    label: "Archive quotidienne manquante",
    autoClose: true,
    remediation: "retry_archive",
    detect: async (db) => {
      const late = (
        await one<{ late: boolean }>(
          db,
          "SELECT extract(hour FROM now() AT TIME ZONE 'Europe/Paris')>=1 AS late",
        )
      ).late;
      const today = await parisToday(db);
      const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 864e5)
        .toISOString()
        .slice(0, 10);
      const days = (await missingArchiveDays(db)).filter(
        (d) => d < yesterday || late,
      );
      return days.length
        ? [
            {
              fingerprint: "archive_missing",
              restaurant_id: null,
              severity: "ERROR",
              module: "security",
              title: "Archive quotidienne manquante",
              user_message: `Archive absente pour : ${days.join(", ")}.`,
              context: { days },
            },
          ]
        : [];
    },
  },
  {
    id: "purge_blocked",
    level: "A",
    label: "Purge bloquée par un jour non archivé",
    autoClose: true,
    remediation: "retry_archive",
    detect: async (db) => {
      const last = await rows<{ details: { blocked?: string[] } }>(
        db,
        "SELECT details FROM ops_security_jobs WHERE job='purge' ORDER BY finished_at DESC LIMIT 1",
      );
      const blocked = last[0]?.details.blocked ?? [];
      return blocked.length
        ? [
            {
              fingerprint: "purge_blocked",
              restaurant_id: null,
              severity: "ERROR",
              module: "security",
              title: "Purge bloquée",
              user_message: `Jours non archivés conservés au-delà de la durée de rétention : ${blocked.join(", ")}.`,
              context: { blocked },
            },
          ]
        : [];
    },
  },
  {
    id: "journal_buffer",
    level: "A",
    label: "Événements en attente d’écriture",
    autoClose: true,
    remediation: "flush_log_buffer",
    detect: async () => {
      const b = bufferState();
      return b.pending
        ? [
            {
              fingerprint: "journal_buffer",
              restaurant_id: null,
              severity: "WARNING",
              module: "security",
              title: "Journal temporairement indisponible",
              user_message: `${b.pending} événement(s) en attente d’écriture${b.dropped ? `, ${b.dropped} perdu(s) faute de place` : ""}.`,
              context: { ...b },
            },
          ]
        : [];
    },
  },
  {
    id: "integrity_violation",
    level: "C",
    label: "Altération des archives",
    autoClose: false,
    detect: async (db) =>
      (
        await rows<{ details: { issues: { day: string; kind: string }[] } }>(
          db,
          "SELECT technical_details AS details FROM ops_security_events WHERE event_type='archive.integrity.violation' AND occurred_at>now()-interval '24 hours' ORDER BY occurred_at DESC LIMIT 1",
        )
      ).map((r) => ({
        fingerprint: `integrity_violation:${r.details.issues
          .map((i) => `${i.day}/${i.kind}`)
          .sort()
          .join(",")}`,
        restaurant_id: null,
        severity: "CRITICAL",
        module: "security",
        title: "Altération des archives de sécurité",
        user_message:
          "Le contenu d’une archive ou du journal ne correspond plus à son empreinte. Ne rien corriger automatiquement : préserver les preuves et analyser.",
        context: { issues: r.details.issues },
      })),
  },
  {
    id: "email_delivery_errors",
    level: "C",
    label: "E-mails clients en échec",
    autoClose: false,
    detect: async (db) =>
      (
        await rows<{ restaurant_id: string; n: number }>(
          db,
          `SELECT c.restaurant_id,count(*)::int AS n FROM customer_email_outbox o JOIN customers c ON c.id=o.customer_id
           WHERE o.status='error' AND o.created_at>now()-interval '24 hours' GROUP BY 1`,
        )
      ).map((r) => ({
        fingerprint: `email_delivery_errors:${r.restaurant_id}`,
        restaurant_id: r.restaurant_id,
        severity: "WARNING",
        module: "email",
        title: "E-mails clients non délivrés",
        user_message: `${r.n} e-mail(s) de compte client n’ont pas pu être envoyés en 24 h. Pas de renvoi automatique : les liens contiennent des jetons à usage unique.`,
        context: { failures: r.n },
      })),
  },
  {
    id: "database_slow",
    level: "C",
    label: "Base de données lente",
    autoClose: true,
    detect: async () => {
      const p = lastProbe();
      return p && p.latencyMs > 750
        ? [
            {
              fingerprint: "database_slow",
              restaurant_id: null,
              severity: "WARNING",
              module: "system",
              title: "Temps de réponse inhabituel",
              user_message: `La base a répondu en ${p.latencyMs} ms lors du dernier contrôle.`,
              context: { latencyMs: p.latencyMs },
            },
          ]
        : [];
    },
  },
];

const mode = async (db: DB) =>
  (
    await one<{ m: "observation" | "active" }>(
      db,
      "SELECT remediation_mode AS m FROM ops_security_settings WHERE restaurant_id=coalesce(nullif(current_setting('app.restaurant_id',true),''),restaurant_id) LIMIT 1",
    )
  ).m;

async function plan(db: PGlite, rule: Rule, incidentId: string, d: Detection) {
  const action = rule.remediation && actions[rule.remediation];
  if (!action) {
    if (rule.level === "C")
      await setIncidentStatus(
        db,
        incidentId,
        "intervention_required",
        null,
        "Correction automatique interdite pour ce type d’incident.",
      );
    return;
  }
  const current = await mode(db);
  const status =
    action.level === "B"
      ? "awaiting_approval"
      : current === "active"
        ? "scheduled"
        : "observed";
  const inserted = await db.query(
    `INSERT INTO ops_security_remediations(id,incident_id,action,intervention_level,status,next_attempt_at,proposal,dedupe_key)
     VALUES($1,$2,$3,$4,$5,${status === "scheduled" ? "clock_timestamp()" : "NULL"},$6,$7) ON CONFLICT(dedupe_key) DO NOTHING`,
    [
      randomUUID(),
      incidentId,
      action.id,
      action.level,
      status,
      JSON.stringify(action.proposal(d.context)),
      `${incidentId}:${action.id}`,
    ],
  );
  if (!inserted.affectedRows) return;
  if (status === "observed")
    await record(db, {
      severity: level("INFO"),
      event_type: "remediation.observed",
      module: d.module,
      action: `Mode observation : « ${action.label} » non exécutée`,
      message: `Correction qui aurait été tentée : ${action.label}. Activez le mode actif pour l’exécuter automatiquement.`,
      restaurant_id: d.restaurant_id,
      incident_id: incidentId,
      resolution_status: "detected",
    });
  else if (status === "scheduled")
    await setIncidentStatus(
      db,
      incidentId,
      "auto_fixing",
      null,
      `Correction automatique planifiée : ${action.label}.`,
    );
  else
    await setIncidentStatus(
      db,
      incidentId,
      "intervention_required",
      null,
      `Autorisation requise : ${action.label}.`,
    );
}

export async function detect(db: PGlite) {
  const opened: string[] = [];
  for (const rule of rules) {
    let found: Detection[];
    try {
      found = await rule.detect(db);
    } catch (error) {
      await record(db, {
        severity: level("ERROR"),
        event_type: "detection.rule.failed",
        module: "security",
        action: `Règle ${rule.id} en échec`,
        message: "Une règle de détection n’a pas pu s’exécuter.",
        status: "failure",
        error_code: "RULE_FAILED",
        details: { rule: rule.id, error },
      });
      continue;
    }
    for (const d of found) {
      const incident = await db.transaction((tx) => openIncident(tx, rule, d));
      if (incident.created) {
        opened.push(incident.id);
        await plan(db, rule, incident.id, d);
      }
    }
    if (rule.autoClose) {
      const still = new Set(
        found.map(
          (d) => `${databaseContext.getStore()?.restaurantId}:${d.fingerprint}`,
        ),
      );
      for (const open of await rows<{ id: string; fingerprint: string }>(
        db,
        "SELECT id,fingerprint FROM ops_security_incidents WHERE rule_id=$1 AND status NOT IN ('auto_resolved','manually_resolved')",
        [rule.id],
      ))
        if (!still.has(open.fingerprint)) {
          await db.query(
            "UPDATE ops_security_remediations SET status='abandoned',last_result='Condition disparue avant exécution' WHERE incident_id=$1 AND status IN ('observed','scheduled','failed')",
            [open.id],
          );
          await setIncidentStatus(
            db,
            open.id,
            "auto_resolved",
            null,
            "La condition n’est plus observée lors du dernier contrôle.",
          );
        }
    }
  }
  return opened;
}

/* ───────────────────────── Execution ───────────────────────── */

const MAX_EXECUTIONS_PER_HOUR = 30;
export async function executeRemediation(
  db: PGlite,
  id: string,
  opts: {
    archive: ArchiveOptions;
    actor?: string | null;
    registry?: Record<string, RemediationAction>;
  },
) {
  const registry = opts.registry ?? actions;
  const r = await one<{
    incident_id: string;
    action: string;
    attempts: number;
    max_attempts: number;
    status: string;
    context: Record<string, unknown>;
    module: string;
    restaurant_id: string | null;
  }>(
    db,
    "SELECT r.*,i.context,i.module,i.restaurant_id FROM ops_security_remediations r JOIN ops_security_incidents i ON i.id=r.incident_id WHERE r.id=$1",
    [id],
  );
  const action = registry[r.action];
  if (!action) throw new Error("Action de correction inconnue.");
  const attempt = r.attempts + 1;
  await db.query(
    "UPDATE ops_security_remediations SET status='running',attempts=$2,executed_at=clock_timestamp() WHERE id=$1",
    [id, attempt],
  );
  await record(db, {
    severity: level("INFO"),
    event_type: "remediation.started",
    module: r.module,
    action: `Correction « ${action.label} » · tentative ${attempt}/${r.max_attempts}`,
    message: `Tentative de correction : ${action.label}.`,
    restaurant_id: r.restaurant_id,
    incident_id: r.incident_id,
    resolution_status: "auto_fixing",
    actor_id: opts.actor ?? null,
  });
  try {
    const result = await action.run(db, {
      incidentId: r.incident_id,
      context: r.context ?? {},
      archive: opts.archive,
      actor: opts.actor,
    });
    await db.query(
      "UPDATE ops_security_remediations SET status='succeeded',last_result=$2,next_attempt_at=NULL WHERE id=$1",
      [id, result],
    );
    await record(db, {
      severity: level("INFO"),
      event_type: "remediation.succeeded",
      module: r.module,
      action: `Correction réussie : ${action.label}`,
      message: result,
      restaurant_id: r.restaurant_id,
      incident_id: r.incident_id,
      resolution_status: "auto_resolved",
      status: "success",
      actor_id: opts.actor ?? null,
    });
    await setIncidentStatus(
      db,
      r.incident_id,
      opts.actor ? "manually_resolved" : "auto_resolved",
      opts.actor ?? null,
      opts.actor
        ? `Action autorisée et exécutée : ${result}`
        : `Résolu automatiquement : ${result}`,
    );
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = attempt >= r.max_attempts || action.level === "B";
    await db.query(
      `UPDATE ops_security_remediations SET status=$2,last_result=$3,next_attempt_at=${exhausted ? "NULL" : "clock_timestamp()+make_interval(mins=>$4)"} WHERE id=$1`,
      exhausted
        ? [id, "abandoned", message]
        : [id, "failed", message, 5 ** (attempt - 1)],
    );
    await record(db, {
      severity: level(exhausted ? "ERROR" : "WARNING"),
      event_type: exhausted ? "remediation.abandoned" : "remediation.failed",
      module: r.module,
      action: `Correction échouée : ${action.label}`,
      message: exhausted
        ? `Échec définitif après ${attempt} tentative(s). Intervention humaine nécessaire.`
        : `Échec de la tentative ${attempt}. Nouvelle tentative dans ${5 ** (attempt - 1)} min.`,
      restaurant_id: r.restaurant_id,
      incident_id: r.incident_id,
      status: "failure",
      error_code: "REMEDIATION_FAILED",
      details: { error },
    });
    if (exhausted)
      await setIncidentStatus(
        db,
        r.incident_id,
        "intervention_required",
        null,
        `La correction « ${action.label} » a échoué : intervention nécessaire.`,
      );
    return { ok: false, result: message };
  }
}
export async function processDue(
  db: PGlite,
  opts: {
    archive: ArchiveOptions;
    registry?: Record<string, RemediationAction>;
  },
) {
  const recent = (
    await one<{ n: number }>(
      db,
      "SELECT count(*)::int AS n FROM ops_security_events WHERE event_type='remediation.started' AND occurred_at>now()-interval '1 hour'",
    )
  ).n;
  if (recent >= MAX_EXECUTIONS_PER_HOUR) return [];
  if ((await mode(db)) !== "active") return [];
  const due = await rows<{ id: string }>(
    db,
    // A run interrupted by a restart ("running" for 10 min) is retried, within max_attempts.
    `SELECT id FROM ops_security_remediations WHERE intervention_level='A' AND (
       (status IN ('scheduled','failed') AND next_attempt_at<=clock_timestamp())
       OR (status='running' AND executed_at<clock_timestamp()-interval '10 minutes' AND attempts<max_attempts))
     ORDER BY next_attempt_at NULLS FIRST LIMIT $1`,
    [Math.min(10, MAX_EXECUTIONS_PER_HOUR - recent)],
  );
  const out = [];
  for (const r of due) out.push(await executeRemediation(db, r.id, opts));
  return out;
}

/* ───────────────────────── Maintenance & scheduling ───────────────────────── */

export async function probe(db: DB) {
  const start = performance.now();
  let ok = true;
  try {
    await db.query("SELECT 1");
  } catch {
    ok = false;
  }
  health.atacuisineOpsSecurityProbe = {
    at: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - start),
    ok,
  };
  return health.atacuisineOpsSecurityProbe;
}
/** Nightly work, idempotent: archive missing days, verify, purge once per Paris day. */
export async function nightly(
  db: PGlite,
  archive: ArchiveOptions,
  force = false,
) {
  const today = await parisToday(db);
  const late = (
    await one<{ ok: boolean }>(
      db,
      "SELECT (now() AT TIME ZONE 'Europe/Paris')::time>='00:10' AS ok",
    )
  ).ok;
  if (!late && !force) return { ran: false };
  const doneToday = async (name: string) =>
    (
      await rows(
        db,
        "SELECT 1 FROM ops_security_jobs WHERE job=$1 AND status<>'skipped' AND (finished_at AT TIME ZONE 'Europe/Paris')::date=$2::date",
        [name, today],
      )
    ).length > 0;
  await flushBuffer(db).catch(() => 0);
  const archived = await archivePending(db, archive);
  const verified =
    force || !(await doneToday("verify")) ? await verifyArchives(db) : null;
  const purged =
    force || !(await doneToday("purge")) ? await purgeExpired(db) : null;
  return { ran: true, archived, verified, purged };
}
export async function tick(db: PGlite, archive: ArchiveOptions = {}) {
  return runWithContext(
    { correlationId: randomUUID(), route: "scheduler", actorId: undefined },
    async () => {
      await flushBuffer(db).catch(() => 0);
      await probe(db);
      const maintenance = await nightly(db, archive);
      const opened = await detect(db);
      const executed = await processDue(db, { archive });
      return { maintenance, opened, executed };
    },
  );
}
const scheduler = globalThis as unknown as {
  atacuisineOpsSecurityScheduler?: {
    timer: NodeJS.Timeout;
    running: boolean;
    lastTick: string | null;
    lastError: string | null;
  };
};
export const schedulerState = () =>
  scheduler.atacuisineOpsSecurityScheduler
    ? {
        running: true,
        lastTick: scheduler.atacuisineOpsSecurityScheduler.lastTick,
        lastError: scheduler.atacuisineOpsSecurityScheduler.lastError,
      }
    : { running: false, lastTick: null, lastError: null };
/**
 * In-process scheduler. Valid only because this local build runs one
 * long-lived Node process (PGlite). On serverless hosting, replace it with a
 * platform cron calling the same `tick` (see docs/SECURITY_CENTER.md).
 */
export function startScheduler(_db: PGlite) {
  void _db; /* managed by the persistent worker */
}
