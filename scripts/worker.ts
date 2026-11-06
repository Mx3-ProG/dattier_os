import { tick as operationsTick } from "../src/features/ops-security/engine";
import { nestedDatabase } from "../src/lib/database/nested";
import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../src/lib/database/postgres";
import { withDatabaseContext } from "../src/lib/database/context";
import { rows } from "../src/lib/database/db";
import {
  archiveSecurity,
  scanSecurity,
} from "../src/features/platform/security-jobs";
import { runSeoAudit } from "../src/features/seo/audit";
const url = process.env.WORKER_DATABASE_URL;
if (!url) throw new Error("WORKER_DATABASE_URL requis.");
const db = new PostgresDatabase(url),
  lease = randomUUID();
let stopped = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopped = true;
  });
type Job = {
  id: string;
  restaurant_id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  lease_token: string;
};
async function run(job: Job) {
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
try {
  while (!stopped) {
    const jobs = await rows<Job>(db, "SELECT * FROM app.claim_jobs($1)", [
      lease,
    ]);
    for (const job of jobs) await run(job);
    if (!jobs.length) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await db.close();
}
