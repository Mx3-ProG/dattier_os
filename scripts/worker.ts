import { tick as operationsTick } from "../src/features/ops-security/engine";
import { nestedDatabase } from "../src/lib/database/nested";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PostgresDatabase } from "../src/lib/database/postgres";
import { withDatabaseContext } from "../src/lib/database/context";
import { assertLeastPrivilege, rows } from "../src/lib/database/db";
import {
  archiveSecurity,
  scanSecurity,
} from "../src/features/platform/security-jobs";
import { runSeoAudit } from "../src/features/seo/audit";
import { transcodeMedia } from "../src/features/cms/media-jobs";
import { claimFor, TENANT_CAP } from "../src/features/platform/worker-groups";
import { emailEngine } from "../src/features/email";
import {
  expireUnpaid,
  handleEvent,
  runScheduledPayout,
  sendPayout,
  type MinimalEvent,
  type Run,
} from "../src/features/payments/service";
const url = process.env.WORKER_DATABASE_URL;
if (!url) throw new Error("WORKER_DATABASE_URL requis.");
const claim = claimFor(
  process.env.WORKER_GROUP,
  Number(process.env.WORKER_CONCURRENCY),
);
const db = new PostgresDatabase(url),
  lease = randomUUID();
await assertLeastPrivilege(db, "WORKER_DATABASE_URL");
let stopped = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopped = true;
  });
const HEARTBEAT_MS = 30_000;
const PURGE_MS = 3_600_000;
const alive = process.env.WORKER_HEALTH_FILE;
type Job = {
  id: string;
  restaurant_id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  lease_token: string;
};
async function run(job: Job) {
  // Le bail dure 2 minutes : sans renouvellement, un job long serait repris par un autre worker.
  const heartbeat = setInterval(() => {
    void db
      .query("SELECT app.renew_job_lease($1,$2)", [lease, job.id])
      .catch(() => undefined);
  }, HEARTBEAT_MS);
  try {
    await execute(job);
  } finally {
    clearInterval(heartbeat);
  }
}
async function execute(job: Job) {
  await withDatabaseContext(
    { restaurantId: job.restaurant_id, public: true },
    async () => {
      try {
        if (job.kind === "notification") {
          await db.query(
            "INSERT INTO notifications(id,restaurant_id,message) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
            [
              job.id,
              job.restaurant_id,
              String(job.payload.message).slice(0, 500),
            ],
          );
        } else if (job.kind === "security_archive") {
          await db.transaction((tx) =>
            archiveSecurity(tx, job.restaurant_id, String(job.payload.day)),
          );
        } else if (job.kind === "security_scan") {
          await db.transaction(async (tx) => {
            await tx.exec("SET LOCAL ROLE atacuisine_worker");
            await operationsTick(nestedDatabase(tx));
            await scanSecurity(tx, job.restaurant_id);
          });
        } else if (job.kind === "seo_audit") {
          // Reads only the restaurant's published data, as the application role.
          await db.transaction(async (tx) => {
            await tx.exec("SET LOCAL ROLE atacuisine_app");
            await runSeoAudit(
              tx,
              job.restaurant_id,
              String(job.payload.trigger || "automatique").slice(0, 60),
            );
          });
        } else if (job.kind === "email_send") {
          // Rôle applicatif, contexte de l'établissement : la livraison passe par
          // app.email_claim, atomique, donc sans double envoi avec le serveur web.
          const results = await emailEngine.deliver(
            (fn) =>
              db.transaction(async (tx) => {
                await tx.exec("SET LOCAL ROLE atacuisine_app");
                return fn(tx);
              }),
            job.restaurant_id,
            { only: String(job.payload.message) },
          );
          const failed = results.find((result) => result.status === "error");
          if (failed) throw new Error(failed.error || "Envoi de l’email impossible.");
        } else if (job.kind === "media_transcode") {
          await transcodeMedia(
            (fn) =>
              db.transaction(async (tx) => {
                await tx.exec("SET LOCAL ROLE atacuisine_worker");
                return fn(tx);
              }),
            job.restaurant_id,
            String(job.payload.media),
          );
        } else if (
          [
            "stripe_event",
            "stripe_payout",
            "payout_schedule",
            "online_order_timeout",
          ].includes(job.kind)
        ) {
          // Rôle dédié : seul le worker écrit les paiements et les versements.
          const paymentRun: Run = (fn) =>
            db.transaction(async (tx) => {
              await tx.exec("SET LOCAL ROLE atacuisine_worker");
              return fn(tx);
            });
          if (job.kind === "stripe_event")
            await handleEvent(
              paymentRun,
              job.restaurant_id,
              job.payload as unknown as MinimalEvent,
            );
          else if (job.kind === "stripe_payout")
            await sendPayout(
              paymentRun,
              job.restaurant_id,
              String(job.payload.payout),
            );
          else if (job.kind === "payout_schedule")
            await runScheduledPayout(paymentRun, job.restaurant_id);
          else
            await expireUnpaid(
              paymentRun,
              job.restaurant_id,
              String(job.payload.order),
            );
        } else
          throw new Error("Connecteur indisponible : traitement désactivé.");
        await db.query(
          "UPDATE outbox_jobs SET status='done',completed_at=now(),locked_until=NULL,lease_token=NULL WHERE id=$1 AND lease_token=$2",
          [job.id, lease],
        );
      } catch (e) {
        await db.query(
          "UPDATE outbox_jobs SET status=$3,last_error=$4,available_at=now()+make_interval(secs=>$5),locked_until=NULL,lease_token=NULL WHERE id=$1 AND lease_token=$2",
          [
            job.id,
            lease,
            job.attempts >= 5 ? "failed" : "pending",
            e instanceof Error ? e.message.slice(0, 300) : "Échec",
            15 * 2 ** job.attempts,
          ],
        );
      }
    },
  );
}
const active = new Set<Promise<void>>();
const purge = claim.group === "maintenance" || claim.group === "all";
let lastPurge = 0;
const beat = () =>
  alive
    ? void writeFile(alive, new Date().toISOString()).catch(() => undefined)
    : undefined;
beat();
const healthTimer = alive ? setInterval(beat, 10_000) : undefined;
try {
  while (!stopped) {
    if (purge && Date.now() - lastPurge > PURGE_MS) {
      lastPurge = Date.now();
      await db.query("SELECT app.purge_jobs()").catch(() => undefined);
      await db.query("SELECT app.analytics_sweep()").catch(() => undefined);
    }
    if (active.size >= claim.concurrency) {
      await Promise.race(active);
      continue;
    }
    const jobs = await rows<Job>(
      db,
      "SELECT * FROM app.claim_jobs($1,$2,$3,$4,$5)",
      [lease, claim.group, claim.kinds, claim.excluded, TENANT_CAP],
    );
    for (const job of jobs) {
      const task: Promise<void> = run(job)
        .catch(() => undefined)
        .finally(() => {
          active.delete(task);
        });
      active.add(task);
    }
    if (!jobs.length) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  // Arrêt propre : les jobs en cours se terminent, aucun nouveau n'est pris.
  await Promise.allSettled(active);
} finally {
  if (healthTimer) clearInterval(healthTimer);
  await db.close();
}
