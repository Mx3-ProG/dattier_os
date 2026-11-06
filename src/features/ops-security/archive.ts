import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, unlink, writeFile } from "./archive-storage";
import { databaseContext } from "@/lib/database/context";
import { demoEnabled } from "@/lib/database/db";
import path from "node:path";
import type { Database as PGlite } from "@/lib/database/types";
import { one, rows, type DB } from "@/lib/database/db";
import { record } from "./events";
import { level } from "./model";

/**
 * Daily archives: one immutable row per Paris day, SHA-256 of a canonical JSON
 * export, chained to the previous archive. Optional read-only file mirror.
 * Archiving the journal is NOT a database backup and never touches business data.
 */
export type ArchiveOptions = { archiveDir?: string | null };
export function defaultArchiveDir() {
  const restaurant = databaseContext.getStore()?.restaurantId;
  if (!restaurant) throw new Error("Établissement requis pour les archives.");
  return demoEnabled()
    ? path.resolve(
        process.env.ATACUISINE_DATA_DIR || ".data/atacuisine-demo",
        "security-centre",
        encodeURIComponent(restaurant),
      )
    : `@s3/${encodeURIComponent(restaurant)}/security-centre`;
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Stable serialization: sorted keys, so jsonb key reordering never changes the hash. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
const DAY_EVENTS = `SELECT event_id,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
 severity,event_type,module,action,actor_id,restaurant_id,session_id,correlation_id,resource_id,status,error_code,message,
 technical_details,resolution_status,incident_id
 FROM ops_security_events WHERE (occurred_at AT TIME ZONE 'Europe/Paris')::date=$1::date ORDER BY occurred_at,event_id`;
export const parisToday = async (db: DB) =>
  (
    await one<{ d: string }>(
      db,
      "SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date,'YYYY-MM-DD') AS d",
    )
  ).d;
async function job(
  db: DB,
  name: string,
  status: "success" | "failure" | "skipped",
  started: Date,
  details: Record<string, unknown>,
) {
  await db.query(
    "INSERT INTO ops_security_jobs(id,job,status,started_at,details) VALUES($1,$2,$3,$4,$5)",
    [
      randomUUID(),
      name,
      status,
      started.toISOString(),
      JSON.stringify(details),
    ],
  );
}
const filePath = (dir: string, day: string) => path.join(dir, `${day}.json`);

export async function archiveDay(
  db: PGlite,
  day: string,
  opts: ArchiveOptions = {},
) {
  const started = new Date();
  const dir =
    opts.archiveDir === undefined ? defaultArchiveDir() : opts.archiveDir;
  try {
    const result = await db.transaction(async (tx) => {
      if (
        (
          await rows(tx, "SELECT day FROM ops_security_archives WHERE day=$1", [
            day,
          ])
        ).length
      )
        return { status: "exists" as const };
      const events = await rows<Record<string, unknown>>(tx, DAY_EVENTS, [day]);
      const digest = sha256(canonical(events));
      const prev =
        (
          await rows<{ chain_sha256: string }>(
            tx,
            "SELECT chain_sha256 FROM ops_security_archives WHERE day<$1 ORDER BY day DESC LIMIT 1",
            [day],
          )
        )[0]?.chain_sha256 ?? "GENESIS";
      const chain = sha256(`${prev}:${digest}`);
      await tx.query(
        "INSERT INTO ops_security_archives(day,event_count,payload,sha256,prev_chain,chain_sha256,file_path) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          day,
          events.length,
          JSON.stringify(events),
          digest,
          prev,
          chain,
          dir ? filePath(dir, day) : null,
        ],
      );
      return { status: "created" as const, events, digest, prev, chain };
    });
    if (result.status === "exists") return result;
    if (dir) {
      await mkdir(dir, { recursive: true });
      const target = filePath(dir, day);
      const content = canonical({
        day,
        sha256: result.digest,
        prev_chain: result.prev,
        chain_sha256: result.chain,
        events: result.events,
      });
      // "wx": an existing file is never overwritten.
      await writeFile(target, content, { flag: "wx", mode: 0o444 }).catch(
        async (e: NodeJS.ErrnoException) => {
          if (e.code !== "EEXIST") throw e;
        },
      );
      await chmod(target, 0o444);
    }
    await job(db, "archive", "success", started, {
      day,
      events: result.events.length,
      sha256: result.digest,
    });
    await record(db, {
      severity: level("INFO"),
      event_type: "archive.created",
      module: "security",
      action: `Archive du ${day} créée`,
      message: `Le journal du ${day} a été archivé (${result.events.length} événements) et son empreinte enregistrée.`,
      resource_id: day,
      status: "success",
      details: { sha256: result.digest, chain_sha256: result.chain },
    });
    return {
      status: "created" as const,
      count: result.events.length,
      sha256: result.digest,
    };
  } catch (error) {
    await job(db, "archive", "failure", started, {
      day,
      error: String(error),
    }).catch(() => {});
    await record(db, {
      severity: level("ERROR"),
      event_type: "archive.failed",
      module: "security",
      action: `Échec de l’archive du ${day}`,
      message: `L’archivage du journal du ${day} a échoué. Une nouvelle tentative est prévue.`,
      resource_id: day,
      status: "failure",
      error_code: "ARCHIVE_FAILED",
      details: { error },
    });
    return {
      status: "failed" as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Days before today without archive, within the retention window. */
export async function missingArchiveDays(db: DB) {
  return (
    await rows<{ day: string }>(
      db,
      `WITH bounds AS (
         SELECT (now() AT TIME ZONE 'Europe/Paris')::date AS today,
                (SELECT retention_days FROM ops_security_settings LIMIT 1) AS keep,
                (SELECT min((occurred_at AT TIME ZONE 'Europe/Paris')::date) FROM ops_security_events) AS first)
       SELECT to_char(d,'YYYY-MM-DD') AS day
       FROM bounds, generate_series(greatest(coalesce(first,today), today-keep), today-1, interval '1 day') d
       WHERE NOT EXISTS(SELECT 1 FROM ops_security_archives a WHERE a.day=d::date)
       ORDER BY d LIMIT 31`,
    )
  ).map((r) => r.day);
}
export async function archivePending(db: PGlite, opts: ArchiveOptions = {}) {
  const results = [];
  for (const day of await missingArchiveDays(db))
    results.push({ day, ...(await archiveDay(db, day, opts)) });
  return results;
}

export type IntegrityIssue = {
  day: string;
  kind: "payload" | "chain" | "live" | "file" | "file_missing";
  detail: string;
};
export async function verifyArchives(db: PGlite) {
  const started = new Date();
  const issues: IntegrityIssue[] = [];
  const archives = await rows<{
    day: string;
    payload: unknown[];
    sha256: string;
    prev_chain: string;
    chain_sha256: string;
    file_path: string | null;
    live: boolean;
  }>(
    db,
    `SELECT to_char(day,'YYYY-MM-DD') AS day,payload,sha256,prev_chain,chain_sha256,file_path,
       ((day+1)::timestamp AT TIME ZONE 'Europe/Paris') >= now()-make_interval(days=>(SELECT retention_days FROM ops_security_settings LIMIT 1)) AS live
     FROM ops_security_archives ORDER BY day`,
  );
  let previous: string | null = null;
  for (const a of archives) {
    if (sha256(canonical(a.payload)) !== a.sha256)
      issues.push({
        day: a.day,
        kind: "payload",
        detail: "Le contenu de l’archive ne correspond plus à son empreinte.",
      });
    if (
      sha256(`${a.prev_chain}:${a.sha256}`) !== a.chain_sha256 ||
      (previous && a.prev_chain !== previous)
    )
      issues.push({
        day: a.day,
        kind: "chain",
        detail: "La chaîne d’empreintes entre archives est rompue.",
      });
    previous = a.chain_sha256;
    if (a.live) {
      const events = await rows(db, DAY_EVENTS, [a.day]);
      if (sha256(canonical(events)) !== a.sha256)
        issues.push({
          day: a.day,
          kind: "live",
          detail: "Les événements en base diffèrent de l’archive de ce jour.",
        });
    }
    if (a.file_path) {
      try {
        const file = JSON.parse(await readFile(a.file_path, "utf8"));
        if (
          file.sha256 !== a.sha256 ||
          sha256(canonical(file.events)) !== a.sha256
        )
          issues.push({
            day: a.day,
            kind: "file",
            detail: "Le fichier d’archive a été modifié.",
          });
      } catch {
        issues.push({
          day: a.day,
          kind: "file_missing",
          detail: "Le fichier d’archive est absent ou illisible.",
        });
      }
    }
  }
  const tampered = issues.filter((i) => i.kind !== "file_missing");
  await job(db, "verify", tampered.length ? "failure" : "success", started, {
    checked: archives.length,
    issues,
  });
  await record(db, {
    severity: level(
      tampered.length ? "CRITICAL" : issues.length ? "WARNING" : "INFO",
    ),
    event_type: tampered.length
      ? "archive.integrity.violation"
      : "archive.integrity.verified",
    module: "security",
    action: "Vérification d’intégrité des archives",
    message: tampered.length
      ? `Altération détectée sur ${tampered.length} contrôle(s) d’archive. Intervention humaine requise.`
      : issues.length
        ? `${archives.length} archive(s) vérifiée(s) ; ${issues.length} fichier(s) miroir manquant(s).`
        : `${archives.length} archive(s) vérifiée(s), aucune altération.`,
    status: tampered.length ? "failure" : "success",
    error_code: tampered.length ? "INTEGRITY_VIOLATION" : null,
    details: { issues },
  });
  return { checked: archives.length, issues };
}

/**
 * Retention purge. Only ops_security_events and ops_security_archives older than the
 * retention are deleted, and only for days already archived: a failed archive
 * blocks the purge of that day instead of losing it silently.
 */
export async function purgeExpired(db: PGlite) {
  const started = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.query("SELECT set_config('donuts.security_purge','on',true)");
      const keep = (
        await one<{ k: number }>(
          tx,
          "SELECT retention_days AS k FROM ops_security_settings LIMIT 1",
        )
      ).k;
      const blocked = await rows<{ day: string }>(
        tx,
        `SELECT DISTINCT to_char((occurred_at AT TIME ZONE 'Europe/Paris')::date,'YYYY-MM-DD') AS day FROM ops_security_events e
         WHERE occurred_at < now()-make_interval(days=>$1)
           AND NOT EXISTS(SELECT 1 FROM ops_security_archives a WHERE a.day=(e.occurred_at AT TIME ZONE 'Europe/Paris')::date)`,
        [keep],
      );
      const events = await tx.query(
        `DELETE FROM ops_security_events e WHERE occurred_at < now()-make_interval(days=>$1)
         AND EXISTS(SELECT 1 FROM ops_security_archives a WHERE a.day=(e.occurred_at AT TIME ZONE 'Europe/Paris')::date)`,
        [keep],
      );
      const files = await rows<{ file_path: string | null }>(
        tx,
        `DELETE FROM ops_security_archives WHERE ((day+1)::timestamp AT TIME ZONE 'Europe/Paris') < now()-make_interval(days=>$1) RETURNING file_path`,
        [keep],
      );
      return {
        keep,
        blocked: blocked.map((b) => b.day),
        events: events.affectedRows ?? 0,
        archives: files,
      };
    });
    for (const f of result.archives)
      if (f.file_path)
        await chmod(f.file_path, 0o644)
          .then(() => unlink(f.file_path!))
          .catch(() => {});
    await job(
      db,
      "purge",
      result.blocked.length ? "failure" : "success",
      started,
      {
        events: result.events,
        archives: result.archives.length,
        blocked: result.blocked,
      },
    );
    await record(db, {
      severity: level(result.blocked.length ? "ERROR" : "NOTICE"),
      event_type: result.blocked.length
        ? "retention.blocked"
        : "retention.purged",
      module: "security",
      action: "Application de la conservation",
      message: result.blocked.length
        ? `Purge partielle : ${result.blocked.length} jour(s) non archivé(s) conservé(s) par sécurité.`
        : `Conservation ${result.keep} jours appliquée : ${result.events} événement(s) et ${result.archives.length} archive(s) expirés supprimés. Aucune donnée métier concernée.`,
      status: result.blocked.length ? "failure" : "success",
      error_code: result.blocked.length ? "PURGE_BLOCKED" : null,
      details: { blocked: result.blocked },
    });
    return {
      events: result.events,
      archives: result.archives.length,
      blocked: result.blocked,
    };
  } catch (error) {
    await job(db, "purge", "failure", started, { error: String(error) }).catch(
      () => {},
    );
    await record(db, {
      severity: level("ERROR"),
      event_type: "retention.failed",
      module: "security",
      action: "Échec de la purge",
      message:
        "L’application de la durée de conservation a échoué. Le journal reste intact.",
      status: "failure",
      error_code: "PURGE_FAILED",
      details: { error },
    });
    return { events: 0, archives: 0, blocked: [], error: String(error) };
  }
}
