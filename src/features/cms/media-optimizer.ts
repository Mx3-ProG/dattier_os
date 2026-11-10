import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const exec = promisify(execFile);
export const limits = {
  imageBytes: 32 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  imageMaxSide: 2000,
  videoSeconds: 120,
  outputVideoBytes: 24 * 1024 * 1024,
};
export type OptimizedMedia = {
  data: Buffer;
  kind: "image" | "video";
  mime: string;
  extension: "webp" | "mp4";
  width: number;
  height: number;
  originalSize: number;
  originalName: string;
};
let active = 0;
/** Bound uploads and transcodes per process, without an unbounded in-memory queue. */
export function reserveMediaJob() {
  if (active >= 2)
    throw new Error(
      "Le moteur traite déjà deux médias. Réessayez dans quelques instants.",
    );
  active++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      active--;
    }
  };
}
export async function optimizeMedia(file: File): Promise<OptimizedMedia> {
  const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(
    file.type,
  );
  if (!isImage && !isVideo)
    throw new Error("Formats acceptés : JPG, PNG, WebP, MP4, MOV et WebM.");
  if (
    !file.size ||
    file.size > (isImage ? limits.imageBytes : limits.videoBytes)
  )
    throw new Error(
      isImage ? "Image limitée à 32 Mo." : "Vidéo limitée à 100 Mo.",
    );
  const input = Buffer.from(await file.arrayBuffer());
  const common = {
    originalSize: file.size,
    originalName: file.name.slice(0, 200),
  };
  if (isImage) {
    const sharp = (await import("sharp")).default;
    const image = sharp(input, { failOn: "error", limitInputPixels: 40e6 });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages || 1) > 1
    )
      throw new Error("Image fixe JPG, PNG ou WebP attendue.");
    const out = await image
      .rotate()
      .resize({
        width: limits.imageMaxSide,
        height: limits.imageMaxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 4 })
      .timeout({ seconds: 25 })
      .toBuffer({ resolveWithObject: true });
    return {
      ...common,
      data: out.data,
      width: out.info.width,
      height: out.info.height,
      kind: "image",
      mime: "image/webp",
      extension: "webp",
    };
  }
  const webm = input.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  const mp4 = ["ftyp", "moov", "mdat", "wide"].includes(
    input.subarray(4, 8).toString(),
  );
  if (!webm && !mp4) throw new Error("Conteneur vidéo invalide.");
  const dir = await mkdtemp(path.join(tmpdir(), "atacuisine-media-"));
  const source = path.join(dir, "source"),
    output = path.join(dir, "optimized.mp4");
  try {
    await writeFile(source, input, { mode: 0o600 });
    // Forced demuxer and protocol allowlist prevent playlist/network input handling.
    const inputArgs = [
      "-protocol_whitelist",
      "file",
      "-f",
      webm ? "matroska" : "mov",
    ];
    const probe = await exec(
      process.env.FFPROBE_PATH || "ffprobe",
      [
        ...inputArgs,
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        source,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    const info = JSON.parse(probe.stdout);
    const video = info.streams?.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    const duration = Number(info.format?.duration);
    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > limits.videoSeconds
    )
      throw new Error("Choisissez un extrait vidéo de 2 minutes maximum.");
    if (!video.width || !video.height || video.width * video.height > 40e6)
      throw new Error("Dimensions vidéo non prises en charge.");
    await exec(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "2",
        ...inputArgs,
        "-i",
        source,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-vf",
        "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "fast",
        "-crf",
        "28",
        "-maxrate",
        "1200k",
        "-bufsize",
        "2400k",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-t",
        String(limits.videoSeconds),
        "-fs",
        String(limits.outputVideoBytes + 1),
        "-y",
        output,
      ],
      { timeout: 180000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 },
    );
    const size = (await stat(output)).size;
    if (!size || size > limits.outputVideoBytes)
      throw new Error(
        "Vidéo encore trop lourde après compression. Choisissez un extrait plus court.",
      );
    const result = await exec(
      process.env.FFPROBE_PATH || "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    const encoded = JSON.parse(result.stdout);
    const dimensions = encoded.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    if (!dimensions || Math.abs(Number(encoded.format.duration) - duration) > 1)
      throw new Error("La vidéo n’a pas pu être compressée intégralement.");
    return {
      ...common,
      data: await readFile(output),
      width: dimensions.width,
      height: dimensions.height,
      kind: "video",
      mime: "video/mp4",
      extension: "mp4",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(
        "Compression vidéo indisponible : FFmpeg et FFprobe doivent être installés sur le serveur.",
      );
    if (error instanceof Error && !("cmd" in error)) throw error;
    throw new Error(
      "Impossible de compresser cette vidéo. Vérifiez le fichier ou choisissez un extrait plus court.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
