import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  claimFor,
  WORKER_GROUPS,
} from "../src/features/platform/worker-groups";
import { uploadMedia } from "../src/components/site-editor/media-upload";

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory()
      ? sources(full)
      : /\.(ts|tsx)$/.test(entry)
        ? [full]
        : [];
  });

test("les groupes dédiés ne se recoupent pas et maintenance prend tout le reste", () => {
  const critical = claimFor("critical"),
    media = claimFor("media"),
    maintenance = claimFor("maintenance");
  assert.equal(
    critical.kinds!.filter((kind) => media.kinds!.includes(kind)).length,
    0,
  );
  assert.equal(maintenance.kinds, null);
  assert.deepEqual(
    [...maintenance.excluded!].sort(),
    [...critical.kinds!, ...media.kinds!].sort(),
  );
});

test("un type de job ne reste jamais sans worker", () => {
  const worker = readFileSync("scripts/worker.ts", "utf8");
  const dedicated = Object.values(WORKER_GROUPS).flatMap((g) => g.kinds ?? []);
  for (const kind of dedicated)
    assert.ok(worker.includes(`"${kind}"`), `${kind} n'est pas traité par le worker`);
  // Tout type déposé par le code doit être traité par le worker, sinon il échoue en boucle.
  const enqueued = sources("src")
    .map((file) => readFileSync(file, "utf8"))
    .flatMap((text) =>
      [...text.matchAll(/enqueue\(\s*\w+,\s*[\w.]+,\s*"([a-z_]+)"/g)].map((m) => m[1]),
    );
  assert.ok(enqueued.length >= 4, "Aucun dépôt de job trouvé : motif à revoir");
  for (const kind of enqueued)
    assert.ok(worker.includes(`"${kind}"`), `${kind} n'est pas traité par le worker`);
});

test("configuration du worker : défaut historique, surcharge, groupe inconnu refusé", () => {
  assert.deepEqual(claimFor(undefined), {
    group: "all",
    kinds: null,
    excluded: null,
    concurrency: 1,
  });
  assert.equal(claimFor("critical").concurrency, 4);
  assert.equal(claimFor("critical", 2).concurrency, 2);
  assert.equal(claimFor("critical", Number.NaN).concurrency, 4);
  assert.throws(() => claimFor("inconnu"), /WORKER_GROUP inconnu/);
});

const video = new File([new Uint8Array(1000)], "v.mp4", { type: "video/mp4" });
const queued = {
  url: "/api/cms/r/media/a.mp4",
  kind: "video",
  size: 1000,
  originalSize: 1000,
  savedBytes: 0,
  status: "processing",
};
const fakeRequest = (status: string, extra = {}) =>
  (async (url: string) =>
    url.includes("view=media")
      ? Response.json({
          items: [{ url: queued.url, size: 200, status, ...extra }],
        })
      : Response.json(queued)) as never;

test("éditeur : attend la fin du transcodage et rapporte le gain réel", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = uploadMedia(fakeRequest("ready"), video);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(3000);
  const media = await pending;
  assert.equal(media.size, 200);
  assert.equal(media.savedBytes, 800);
});

test("éditeur : un transcodage en échec remonte son message", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = uploadMedia(
    fakeRequest("failed", { processing_error: "Vidéo limitée à 2 minutes." }),
    video,
  );
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(3000);
  await assert.rejects(pending, /limitée à 2 minutes/);
});
