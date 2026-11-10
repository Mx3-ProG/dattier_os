import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  optimizeMedia,
  reserveMediaJob,
} from "../src/features/cms/media-optimizer";
import { insertDroppedMedia } from "../src/features/cms/media-drop";
import { defaultConfig } from "../src/features/cms/defaults";
import { siteConfigSchema } from "../src/features/cms/schema";
const exec = promisify(execFile);
test("photos are resized, metadata stripped and stored as WebP", async () => {
  const source = await sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 4,
      background: { r: 20, g: 70, b: 40, alpha: 0.5 },
    },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const result = await optimizeMedia(
    new File([new Uint8Array(source)], "photo.png", { type: "image/png" }),
  );
  assert.equal(result.width, 2000);
  assert.equal(result.kind, "image");
  const info = await sharp(result.data).metadata();
  assert.equal(info.format, "webp");
  assert.equal(info.exif, undefined);
  assert.equal(info.hasAlpha, true);
  assert.ok(result.data.length < source.length);
});
test("invalid media never passes through unchanged; engine concurrency is bounded", async () => {
  await assert.rejects(
    optimizeMedia(new File(["not a video"], "bad.mp4", { type: "video/mp4" })),
    /invalide/,
  );
  await assert.rejects(
    optimizeMedia(new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })),
    /Formats/,
  );
  const a = reserveMediaJob(),
    b = reserveMediaJob();
  assert.throws(reserveMediaJob, /deux médias/);
  a();
  a();
  const c = reserveMediaJob();
  b();
  c();
});
test("raw video is transcoded to H264/AAC MP4 without keeping its source", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "media-test-"));
  try {
    const source = path.join(dir, "raw.mov");
    await exec(process.env.FFMPEG_PATH || "ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1920x1080:rate=30",
      "-t",
      "1",
      "-c:v",
      "mpeg4",
      "-q:v",
      "2",
      "-y",
      source,
    ]);
    const buffer = await readFile(source);
    const result = await optimizeMedia(
      new File([new Uint8Array(buffer)], "rush.mov", {
        type: "video/quicktime",
      }),
    );
    assert.equal(result.mime, "video/mp4");
    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);
    assert.ok(result.data.length < buffer.length);
    assert.equal(result.data.subarray(4, 8).toString(), "ftyp");
    console.log(`Video: ${buffer.length} → ${result.data.length} bytes`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("drop replaces editable media, adds new blocks and refuses protected pages", () => {
  const config = defaultConfig();
  const allowed = ["textImage", "video"] as const;
  const media = { kind: "image" as const, url: "/cms/restaurant.svg" };
  insertDroppedMedia(
    config,
    "home",
    "home-hero",
    media,
    [...allowed],
    false,
    "new-image",
  );
  insertDroppedMedia(
    config,
    "home",
    null,
    media,
    [...allowed],
    false,
    "new-image",
  );
  insertDroppedMedia(
    config,
    "home",
    null,
    {
      kind: "video",
      url: "/api/cms/bernay/media/00000000-0000-0000-0000-000000000000.mp4",
    },
    [...allowed],
    false,
    "new-video",
  );
  siteConfigSchema.parse(config);
  assert.equal(config.pages.home.sections.at(-1)?.type, "video");
  const before = JSON.stringify(config.pages.checkout);
  assert.throws(
    () =>
      insertDroppedMedia(
        config,
        "checkout",
        null,
        media,
        [...allowed],
        true,
        "bad",
      ),
    /protégée/,
  );
  assert.equal(JSON.stringify(config.pages.checkout), before);
  assert.throws(
    () => insertDroppedMedia(config, "home", null, media, [], false, "bad"),
    /autorisé/,
  );
});
