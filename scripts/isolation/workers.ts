import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Client, Pool } from "pg";
import type { World } from "./seed";

type Check = (section: string, ok: boolean, detail: string) => void;
type Job = { id: string; restaurant_id: string; kind: string; attempts: number };

/** Équité, baux et purge, puis un vrai processus worker sur de vrais jobs. */
export async function workerChecks(
  world: World,
  migrator: Client,
  worker: Pool,
  workerUrl: string,
  check: Check,
) {
  const section = "Worker groups";
  const r = world.restaurant;
  const kind = `iso_${world.run}`.replaceAll("-", "_");
  const insert = (restaurant: string, n: number, k = kind) =>
    migrator.query(
      `INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key,available_at)
       SELECT gen_random_uuid()::text,$1,$2,'{}'::jsonb,gen_random_uuid()::text,now()-interval '1 minute'
         FROM generate_series(1,$3::int)`,
      [restaurant, k, n],
    );
  const claim = async (token: string, group: string, kinds = [kind], cap = 1) =>
    (
      await worker.query<Job>(
        "SELECT * FROM app.claim_jobs($1,$2,$3,NULL,$4)",
        [token, group, kinds, cap],
      )
    ).rows[0] as Job | undefined;
  const finish = (id: string) =>
    migrator.query(
      "UPDATE outbox_jobs SET status='done',completed_at=now(),lease_token=NULL,locked_until=NULL WHERE id=$1",
      [id],
    );
  const clear = (k = kind) =>
    migrator.query("DELETE FROM outbox_jobs WHERE kind=$1", [k]);
  const group = `iso-${world.run}`;

  // 1. Mille jobs de A ne retardent pas l'unique job de B.
  await insert(r.a1, 1000);
  await migrator.query("SELECT pg_sleep(0.01)");
  await insert(r.b1, 1);
  const started = Date.now();
  const first = await claim("t1", group);
  const second = await claim("t2", group);
  const third = await claim("t3", group);
  check(
    section,
    new Set([first?.restaurant_id, second?.restaurant_id]).size === 2 &&
      [first?.restaurant_id, second?.restaurant_id].includes(r.b1),
    `Le job de B n'est pas pris dans les deux premiers : ${first?.restaurant_id}, ${second?.restaurant_id}`,
  );
  check(
    section,
    !third,
    "Le plafond par client est dépassé : un 3e job est pris alors que A et B sont occupés",
  );
  check(
    section,
    Date.now() - started < 3000,
    `Réclamation trop lente avec 1000 jobs en attente : ${Date.now() - started} ms`,
  );
  await clear();

  // 2. Avec un seul créneau, le tourniquet alterne au lieu de vider A d'abord.
  await insert(r.a1, 5);
  await insert(r.b1, 5);
  const order: string[] = [];
  for (let i = 0; i < 6; i++) {
    const job = await claim(`rr${i}`, `${group}-rr`);
    if (job) {
      order.push(job.restaurant_id === r.a1 ? "A" : "B");
      await finish(job.id);
    }
  }
  check(
    section,
    /^(AB){3}$|^(BA){3}$/.test(order.join("")),
    `Tourniquet non respecté : ${order.join("")}`,
  );
  await clear();

  // 3. Réclamations simultanées : jamais deux fois le même job, plafond strict.
  await insert(r.a1, 3);
  await insert(r.b1, 3);
  const parallel = await Promise.all(
    Array.from({ length: 12 }, (_, i) => claim(`p${i}`, `${group}-p`)),
  );
  const taken = parallel.filter(Boolean) as Job[];
  check(
    section,
    taken.length === 2 && new Set(taken.map((j) => j.restaurant_id)).size === 2,
    `Réclamations simultanées : ${taken.length} jobs pris pour 2 attendus`,
  );
  await clear();

  // 4. Un groupe ne prend pas les jobs des autres.
  await insert(r.a1, 1, `${kind}_other`);
  check(
    section,
    !(await claim("g1", `${group}-g`)),
    "Un groupe a pris un job qui n'est pas le sien",
  );
  const excluded = (
    await worker.query<Job>("SELECT * FROM app.claim_jobs('g2',$1,NULL,$2,5)", [
      `${group}-g2`,
      [`${kind}_other`],
    ])
  ).rows.filter((j) => j.kind === `${kind}_other`);
  check(section, !excluded.length, "Un type exclu a été pris");
  await migrator.query("UPDATE outbox_jobs SET status='pending',attempts=0,locked_until=NULL,lease_token=NULL WHERE lease_token='g2'");
  await clear(`${kind}_other`);

  // 5. Bail : un job vivant n'est pas repris, un job abandonné l'est une seule fois.
  await insert(r.a1, 1);
  const leased = (await claim("alive", `${group}-l`))!;
  const renewed = await worker.query<{ ok: boolean }>(
    "SELECT app.renew_job_lease('alive',$1) AS ok",
    [leased.id],
  );
  const stolen = await worker.query<{ ok: boolean }>(
    "SELECT app.renew_job_lease('other',$1) AS ok",
    [leased.id],
  );
  check(section, renewed.rows[0].ok, "Le bail n'est pas renouvelé");
  check(section, !stolen.rows[0].ok, "Un autre worker renouvelle un bail qui n'est pas le sien");
  check(
    section,
    !(await claim("thief", `${group}-l`)),
    "Un job au bail valide a été repris",
  );
  await migrator.query(
    "UPDATE outbox_jobs SET locked_until=now()-interval '1 second' WHERE id=$1",
    [leased.id],
  );
  const again = await claim("heir", `${group}-l`);
  check(
    section,
    again?.id === leased.id && again.attempts === 2,
    `Job abandonné non repris : ${JSON.stringify(again)}`,
  );
  check(
    section,
    !(await claim("heir2", `${group}-l`)),
    "Un job abandonné a été repris deux fois",
  );
  await clear();

  // 6. Purge : la maintenance disparaît, la déduplication des paiements reste.
  const old = async (k: string, status: string, age: string) => {
    const id = randomUUID();
    await migrator.query(
      "INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key,status,completed_at) VALUES($1,$2,$3,'{}',$1,$4,now()-$5::interval)",
      [id, r.a1, k, status, age],
    );
    return id;
  };
  const scanOld = await old("security_scan", "done", "8 days");
  const scanNew = await old("security_scan", "done", "1 day");
  const stripeOld = await old("stripe_event", "done", "30 days");
  const stripeVeryOld = await old("stripe_event", "done", "91 days");
  const failed = await old("security_scan", "failed", "60 days");
  await worker.query("SELECT app.purge_jobs()");
  const left = async (id: string) =>
    !!(await migrator.query("SELECT 1 FROM outbox_jobs WHERE id=$1", [id]))
      .rowCount;
  check(section, !(await left(scanOld)), "Purge : ancien scan conservé");
  check(section, await left(scanNew), "Purge : scan récent supprimé");
  check(section, await left(stripeOld), "Purge : déduplication Stripe récente supprimée");
  check(section, !(await left(stripeVeryOld)), "Purge : très ancien événement Stripe conservé");
  check(section, await left(failed), "Purge : job en échec supprimé");

  // 7. Vrai worker du groupe maintenance : un job de A n'écrit que chez A.
  await migrator.query("DELETE FROM outbox_jobs WHERE restaurant_id=ANY($1)", [
    Object.values(r),
  ]);
  const auditCount = async (restaurant: string) =>
    (
      await migrator.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM seo_audits WHERE restaurant_id=$1",
        [restaurant],
      )
    ).rows[0].count;
  const beforeA = await auditCount(r.a1),
    beforeB = await auditCount(r.b1);
  const jobId = randomUUID(),
    scanId = randomUUID(),
    paymentId = randomUUID();
  await migrator.query(
    `INSERT INTO outbox_jobs(id,restaurant_id,kind,payload,dedupe_key) VALUES
       ($1,$2,'seo_audit','{"trigger":"isolation"}',$1),
       ($3,$2,'security_scan','{}',$3),
       ($4,$2,'stripe_event','{}',$4)`,
    [jobId, r.a1, scanId, paymentId],
  );
  const healthFile = path.join(tmpdir(), `isolation-worker-${world.run}`);
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/worker.ts"],
    {
      env: {
        ...process.env,
        ATACUISINE_DEMO: "false",
        WORKER_DATABASE_URL: workerUrl,
        WORKER_GROUP: "maintenance",
        WORKER_HEALTH_FILE: healthFile,
        SESSION_SECRET: "isolation-test-secret-0123456789-abcdef",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const status = async (id: string) =>
    (
      await migrator.query<{ status: string; last_error: string | null }>(
        "SELECT status,last_error FROM outbox_jobs WHERE id=$1",
        [id],
      )
    ).rows[0];
  for (let i = 0; i < 60; i++) {
    const [a, b] = await Promise.all([status(jobId), status(scanId)]);
    if (a.status !== "pending" && a.status !== "running" && b.status !== "pending" && b.status !== "running") break;
    if ((a.last_error || b.last_error) && i > 20) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const seo = await status(jobId),
    scan = await status(scanId),
    payment = await status(paymentId);
  check(
    section,
    seo.status === "done",
    `Audit SEO via le vrai worker : ${seo.status} ${seo.last_error ?? ""} ${output.slice(-300)}`,
  );
  check(
    section,
    scan.status === "done",
    `Scan de sécurité via le vrai worker : ${scan.status} ${scan.last_error ?? ""}`,
  );
  check(
    section,
    payment.status === "pending",
    `Le groupe maintenance a touché un job de paiement : ${payment.status}`,
  );
  check(section, (await auditCount(r.a1)) === beforeA + 1, "L'audit SEO n'a pas été écrit chez A");
  check(section, (await auditCount(r.b1)) === beforeB, "Un job de A a écrit chez B");
  check(section, existsSync(healthFile), "Le worker n'écrit pas son signal de vie");
  await rm(healthFile, { force: true });
  const stopped = new Promise<number | null>((resolve) =>
    child.once("exit", (code) => resolve(code)),
  );
  child.kill("SIGTERM");
  const code = await Promise.race([
    stopped,
    new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 15000)),
  ]);
  check(section, code === 0, `Arrêt du worker par SIGTERM : ${code}`);
  if (code === "timeout") child.kill("SIGKILL");
  await migrator.query("DELETE FROM outbox_jobs WHERE id=$1", [paymentId]);

  // 8. Un rôle privilégié est refusé au démarrage.
  const unsafe = spawn(process.execPath, ["--import", "tsx", "scripts/worker.ts"], {
    env: {
      ...process.env,
      WORKER_DATABASE_URL: process.env.MIGRATION_DATABASE_URL,
      WORKER_GROUP: "maintenance",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let refused = "";
  unsafe.stderr.on("data", (d) => (refused += d));
  const exit = await new Promise<number | null>((resolve) =>
    unsafe.once("exit", resolve),
  );
  check(
    section,
    exit !== 0 && refused.includes("sans BYPASSRLS"),
    `Worker lancé avec un rôle privilégié : sortie ${exit}`,
  );
}
