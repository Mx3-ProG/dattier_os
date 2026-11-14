import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Télécharge les photos et vidéos libres de droit (Pexels) utilisées par les
 * modèles de sites. Les vidéos sont recompressées pour rester légères.
 * Usage : npm run assets:fetch
 */
const root = process.cwd();
const manifestPath = resolve(root, "public/cms/assets-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  templates: Record<
    string,
    {
      photos: Record<string, number>;
      video: { id: number; file: string; title: string };
    }
  >;
};

const photoUrl = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1400`;
const videoUrl = (id: number, file: string) =>
  `https://videos.pexels.com/video-files/${id}/${file}`;

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { stdio: "pipe" });

let downloaded = 0;
let skipped = 0;

for (const [id, assets] of Object.entries(manifest.templates)) {
  const dir = resolve(root, "public/cms", id);
  mkdirSync(dir, { recursive: true });
  for (const [name, photoId] of Object.entries(assets.photos)) {
    const file = resolve(dir, `${name}.jpg`);
    if (existsSync(file)) {
      skipped++;
      continue;
    }
    run("curl", ["-sL", "--fail", "-o", file, photoUrl(photoId)]);
    downloaded++;
    console.log(`photo ${id}/${name}.jpg`);
  }
  const videoFile = resolve(dir, "video.mp4");
  if (!existsSync(videoFile)) {
    const raw = resolve(dir, "video-source.mp4");
    run("curl", ["-sL", "--fail", "-o", raw, videoUrl(assets.video.id, assets.video.file)]);
    // Recompression : 8 s, 960x540, sans son, pour un poids web acceptable.
    run("ffmpeg", [
      "-y",
      "-i", raw,
      "-t", "8",
      "-vf", "scale=960:540",
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "30",
      "-an",
      "-movflags", "+faststart",
      videoFile,
    ]);
    run("rm", ["-f", raw]);
    downloaded++;
    console.log(`video ${id}/video.mp4`);
  } else skipped++;
}

// Crédits : chaque ressource pointe vers sa page Pexels.
const credits = Object.entries(manifest.templates).map(([id, assets]) => ({
  template: id,
  photos: Object.entries(assets.photos).map(([name, photoId]) => ({
    file: `public/cms/${id}/${name}.jpg`,
    source: `https://www.pexels.com/photo/${photoId}/`,
  })),
  video: {
    file: `public/cms/${id}/video.mp4`,
    source: `https://www.pexels.com/video/${assets.video.id}/`,
    title: assets.video.title,
  },
}));
writeFileSync(
  resolve(root, "public/cms/assets-credits.json"),
  JSON.stringify(
    {
      license: "Pexels License — usage commercial libre, sans attribution obligatoire",
      generatedAt: new Date().toISOString(),
      assets: credits,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\n${downloaded} fichiers téléchargés, ${skipped} déjà présents.`);
