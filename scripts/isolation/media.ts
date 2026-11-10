import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Client } from "pg";
import { sessionCookie } from "./http";
import type { World } from "./seed";

type Check = (section: string, ok: boolean, detail: string) => void;
const exec = promisify(execFile);

/** Parcours réel d'un média : app, stockage S3, worker media et diffusion en flux. */
export async function mediaChecks(
  world: World,
  migrator: Client,
  appUrl: string,
  workerUrl: string,
  check: Check,
) {
  const section = "Médias";
  const owner = await sessionCookie("nadia"),
    other = await sessionCookie(world.profile.ownerB);
  const dir = await mkdtemp(path.join(tmpdir(), "isolation-media-"));
  const workers: ChildProcess[] = [];
  const startWorker = () => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/worker.ts"], {
      env: {
        ...process.env,
        ATACUISINE_DEMO: "false",
        WORKER_DATABASE_URL: workerUrl,
        WORKER_GROUP: "media",
        SESSION_SECRET: "isolation-test-secret-0123456789-abcdef",
      },
      stdio: "ignore",
    });
    workers.push(child);
    return child;
  };
  try {
    await exec("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "testsrc2=duration=12:size=1920x1080:rate=30",
      "-c:v", "libx264", "-preset", "ultrafast", path.join(dir, "video.mp4"),
    ]);
    const video = await readFile(path.join(dir, "video.mp4"));
    const upload = async (data: Buffer, type: string, name: string) => {
      const form = new FormData();
      form.append("file", new File([new Uint8Array(data)], name, { type }));
      const started = Date.now();
      const response = await fetch(`${appUrl}/api/cms/bernay/media`, {
        method: "POST",
        headers: { cookie: owner, origin: appUrl },
        body: form,
      });
      return {
        status: response.status,
        body: (await response.json()) as Record<string, string>,
        ms: Date.now() - started,
      };
    };
    const row = async (id: string) =>
      (
        await migrator.query<{
          status: string;
          attempts: number;
          processing_error: string | null;
          source_key: string | null;
          size: number;
          file: string;
        }>(
          "SELECT m.status,m.processing_error,m.source_key,m.size,m.file,j.attempts FROM cms_media m LEFT JOIN outbox_jobs j ON j.dedupe_key=m.id AND j.kind='media_transcode' WHERE m.id=$1",
          [id],
        )
      ).rows[0];
    const waitFor = async (id: string, done: (s: string) => boolean, seconds = 120) => {
      for (let i = 0; i < seconds * 4; i++) {
        const current = await row(id);
        if (done(current.status)) return current;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return row(id);
    };
    const get = (url: string, cookie?: string, range?: string) =>
      fetch(`${appUrl}${url}`, {
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(range ? { range } : {}),
        },
      });

    // 1. L'envoi rend la main sans transcoder, et rien n'est servi avant la fin.
    const queued = await upload(video, "video/mp4", "isolation.mp4");
    check(
      section,
      queued.status === 200 && queued.body.status === "processing",
      `Envoi vidéo → ${queued.status} ${JSON.stringify(queued.body).slice(0, 200)}`,
    );
    if (!queued.body.id) return;
    const id = queued.body.id,
      url = queued.body.url;
    const pending = await get(url, owner);
    check(section, pending.status === 404, `Vidéo servie avant la fin : ${pending.status}`);
    const draftMedia = await fetch(`${appUrl}/api/cms/bernay?view=media`, {
      headers: { cookie: owner },
    });
    const listing = (await draftMedia.json()) as {
      items?: { id: string; status: string }[];
    };
    check(
      section,
      listing.items?.find((m) => m.id === id)?.status === "processing",
      "La médiathèque n'indique pas « en cours »",
    );

    // 2. Worker tué en plein transcodage : repris une seule fois par le suivant.
    const victim = startWorker();
    const running = await (async () => {
      for (let i = 0; i < 200; i++) {
        const { rows } = await migrator.query<{ status: string }>(
          "SELECT status FROM outbox_jobs WHERE kind='media_transcode' AND dedupe_key=$1",
          [id],
        );
        if (rows[0]?.status === "running") return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    })();
    check(section, running, "Le worker media ne prend pas le job");
    victim.kill("SIGKILL");
    await migrator.query(
      "UPDATE outbox_jobs SET locked_until=now()-interval '1 second' WHERE kind='media_transcode' AND dedupe_key=$1",
      [id],
    );
    const survivor = startWorker();
    const ready = await waitFor(id, (s) => s !== "processing");
    check(
      section,
      ready.status === "ready" && ready.attempts === 2,
      `Reprise après plantage : ${ready.status}, ${ready.attempts} tentatives, ${ready.processing_error ?? ""}`,
    );
    check(section, !ready.source_key, "L'original reste référencé après le transcodage");
    check(section, ready.size < video.length, `Vidéo non réduite : ${ready.size} octets`);

    // 3. L'original est bien supprimé du stockage.
    const store = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    const sourceGone = await store
      .send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `bernay/cms/incoming/${id}`,
        }),
      )
      .then(() => false)
      .catch(() => true);
    check(section, sourceGone, "L'original n'est pas supprimé du stockage");

    // 4. Diffusion en flux et plages d'octets, pour le bon établissement seulement.
    const whole = await get(url, owner);
    const body = Buffer.from(await whole.arrayBuffer());
    check(
      section,
      whole.status === 200 && body.length === ready.size,
      `Lecture complète → ${whole.status}, ${body.length}/${ready.size} octets`,
    );
    const part = await get(url, owner, "bytes=0-99");
    const partBody = Buffer.from(await part.arrayBuffer());
    check(
      section,
      part.status === 206 &&
        partBody.length === 100 &&
        part.headers.get("content-range") === `bytes 0-99/${ready.size}` &&
        partBody.equals(body.subarray(0, 100)),
      `Plage → ${part.status}, ${partBody.length} octets, ${part.headers.get("content-range")}`,
    );
    const late = await get(url, owner, `bytes=${ready.size + 10}-`);
    check(section, late.status === 416, `Plage hors fichier → ${late.status}`);
    check(section, (await get(url)).status === 404, "Un anonyme lit une vidéo non publiée");
    check(section, (await get(url, other)).status === 404, "Le client B lit une vidéo de A");
    const file = ready.file;
    check(
      section,
      (await get(`/api/cms/${world.restaurant.b1}/media/${file}`, other)).status === 404,
      "Le fichier de A est lisible par le chemin de B",
    );

    // 5. Vingt téléchargements lents ne bloquent ni la base ni les autres requêtes.
    const readers = await Promise.all(
      Array.from({ length: 20 }, () => get(url, owner)),
    );
    const started = Date.now();
    const health = await fetch(`${appUrl}/api/restaurants/bernay/finance`, {
      headers: { cookie: owner },
    });
    const healthMs = Date.now() - started;
    check(
      section,
      health.status === 200 && healthMs < 3000,
      `API pendant 20 lectures non consommées : ${health.status} en ${healthMs} ms`,
    );
    const counts = await Promise.all(readers.map((r) => r.arrayBuffer()));
    check(
      section,
      counts.every((b) => b.byteLength === ready.size),
      "Une lecture simultanée est incomplète",
    );

    // 6. Une vidéo illisible échoue une seule fois, avec un message, sans fichier orphelin.
    const broken = await upload(Buffer.from(randomUUID().repeat(100)), "video/mp4", "cassee.mp4");
    const failed = await waitFor(broken.body.id, (s) => s !== "processing");
    check(
      section,
      failed.status === "failed" && !!failed.processing_error && failed.attempts === 1,
      `Vidéo illisible : ${failed.status}, ${failed.attempts} tentatives, ${failed.processing_error}`,
    );
    const draft = await fetch(`${appUrl}/api/cms/bernay?view=media`, {
      headers: { cookie: owner },
    });
    check(section, draft.status === 200, `Médiathèque → ${draft.status}`);

    // 7. Les images restent traitées directement et se lisent en flux.
    const sharp = (await import("sharp")).default;
    const image = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#884400" },
    })
      .png()
      .toBuffer();
    const sent = await upload(image, "image/png", "image.png");
    check(
      section,
      sent.status === 200 && !sent.body.status,
      `Envoi image → ${sent.status} ${JSON.stringify(sent.body).slice(0, 160)}`,
    );
    const read = await get(sent.body.url, owner);
    check(
      section,
      read.status === 200 && (await read.arrayBuffer()).byteLength > 0,
      `Lecture image → ${read.status}`,
    );
    survivor.kill("SIGTERM");
  } finally {
    for (const child of workers) child.kill("SIGKILL");
    await rm(dir, { recursive: true, force: true });
  }
}
