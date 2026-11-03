import { randomUUID, createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { rows, one, type DB } from "@/lib/database/db";
import { enqueue } from "./jobs";
function storage() {
  if (!process.env.S3_BUCKET)
    throw new Error("Stockage des archives non configuré.");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "eu-west-3",
    forcePathStyle: process.env.S3_PATH_STYLE === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
async function incident(db: DB, r: string, rule: string, message: string) {
  await db.query(
    "INSERT INTO security_incidents(id,restaurant_id,rule,message) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,rule) DO UPDATE SET status=CASE WHEN security_incidents.status IN ('resolved','archived') THEN 'open' ELSE security_incidents.status END,message=excluded.message,updated_at=now()",
    [randomUUID(), r, rule, message],
  );
}
export async function archiveSecurity(db: DB, r: string, day: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day >= new Date().toISOString().slice(0, 10)
  )
    throw new Error("Journée d’archive invalide.");
  const s3 = storage(),
    key = `${encodeURIComponent(r)}/security/${day}.json`;
  const records = await rows(
    db,
    "SELECT id,severity,event_type,message,actor_id,created_at FROM security_events WHERE restaurant_id=$1 AND (created_at AT TIME ZONE 'Europe/Paris')::date=$2::date ORDER BY created_at,id",
    [r, day],
  );
  const previous = await rows<{ sha256: string }>(
    db,
    "SELECT sha256 FROM security_archives WHERE restaurant_id=$1 AND day<$2::date ORDER BY day DESC LIMIT 1",
    [r, day],
  );
  const body = JSON.stringify({
    restaurant: r,
    day,
    previous: previous[0]?.sha256 || null,
    events: records,
  });
  const hash = createHash("sha256").update(body).digest("hex");
  const existing = await rows<{ sha256: string; object_key: string }>(
    db,
    "SELECT sha256,object_key FROM security_archives WHERE restaurant_id=$1 AND day=$2::date",
    [r, day],
  );
  if (existing.length) {
    const object = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: existing[0].object_key,
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    const saved = await object.Body?.transformToByteArray();
    if (
      !saved ||
      createHash("sha256").update(saved).digest("hex") !== existing[0].sha256
    ) {
      await incident(
        db,
        r,
        "archive-integrity",
        "Archive altérée : préserver les preuves et contrôler le stockage.",
      );
      throw new Error("Archive altérée.");
    }
    return;
  }
  await s3
    .send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: "application/json",
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    )
    .catch(async (e) => {
      if (e?.$metadata?.httpStatusCode !== 412) throw e;
    });
  const result = await s3.send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    { abortSignal: AbortSignal.timeout(30000) },
  );
  const saved = await result.Body?.transformToByteArray();
  if (!saved || createHash("sha256").update(saved).digest("hex") !== hash)
    throw new Error("Archive existante différente ; contrôle manuel requis.");
  await db.query(
    "INSERT INTO security_archives(id,restaurant_id,day,object_key,sha256,previous_sha256,verified_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(restaurant_id,day) DO NOTHING",
    [randomUUID(), r, day, key, hash, previous[0]?.sha256 || null],
  );
}
export async function scanSecurity(db: DB, r: string) {
  const failed = await one<{ count: number }>(
    db,
    "SELECT count(*)::int AS count FROM outbox_jobs WHERE restaurant_id=$1 AND status='failed'",
    [r],
  );
  if (failed.count)
    await incident(
      db,
      r,
      "failed-jobs",
      `${failed.count} tâches ont épuisé leurs tentatives ; intervention nécessaire.`,
    );
  const errors = await one<{ count: number }>(
    db,
    "SELECT count(*)::int AS count FROM security_events WHERE restaurant_id=$1 AND severity IN ('ERROR','CRITICAL') AND created_at>now()-interval '10 minutes'",
    [r],
  );
  if (errors.count >= 3)
    await incident(
      db,
      r,
      "repeated-errors",
      "Plusieurs erreurs récentes : consulter le journal et les traitements associés.",
    );
  const latest = await rows<{ day: string }>(
    db,
    "SELECT day::text FROM security_archives WHERE restaurant_id=$1 ORDER BY day DESC LIMIT 1",
    [r],
  );
  const yesterday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date(Date.now() - 86400000));
  if (!latest.length || latest[0].day < yesterday) {
    await enqueue(db, r, "security_archive", yesterday, { day: yesterday });
  }
  const next = new Date(Date.now() + 60000);
  await enqueue(db, r, "security_scan", next.toISOString().slice(0, 16), {});
  await db.query(
    "UPDATE outbox_jobs SET available_at=$3 WHERE restaurant_id=$1 AND kind='security_scan' AND dedupe_key=$2 AND status='pending'",
    [r, next.toISOString().slice(0, 16), next.toISOString()],
  );
}
