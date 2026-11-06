import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { rows, one, demoEnabled, type DB } from "@/lib/database/db";
export const limits = {
  imageBytes: 8 * 1024 * 1024,
  videoBytes: 40 * 1024 * 1024,
  imageMaxSide: 2000,
};
export const FILE_NAME = /^[a-f0-9-]{36}\.(webp|jpg|png|mp4|webm)$/;
export type MediaRow = {
  id: string;
  kind: "image" | "video";
  file: string;
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  original_name: string;
  created_at: string;
};
function storage() {
  if (!process.env.S3_BUCKET) throw new Error("Stockage non configuré.");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "eu-west-3",
    forcePathStyle: process.env.S3_PATH_STYLE === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
function localFile(r: string, file: string) {
  if (!FILE_NAME.test(file)) throw new Error("Média invalide.");
  const root = path.resolve(
    process.env.ATACUISINE_DATA_DIR || ".data/atacuisine-demo",
    "cms-media",
    encodeURIComponent(r),
  );
  const target = path.resolve(root, file);
  if (!target.startsWith(root + path.sep)) throw new Error("Chemin invalide.");
  return target;
}
export function cmsMedia(restaurant: string) {
  const mediaUrl = (file: string) => `/api/cms/${restaurant}/media/${file}`;
  async function listMedia(db: DB) {
    return (
      await rows<Omit<MediaRow, "url">>(
        db,
        "SELECT id,kind,file,mime,size,width,height,alt,original_name,created_at FROM cms_media WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 500",
        [restaurant],
      )
    ).map((m) => ({ ...m, url: mediaUrl(m.file) }));
  }
  async function saveSiteMedia(db: DB, file: File, actor: string) {
    await one(db, "SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [
      restaurant,
    ]);
    const usage = await one<{ total: number; count: number }>(
      db,
      "SELECT coalesce(sum(size),0)::float AS total,count(*)::int AS count FROM cms_media WHERE restaurant_id=$1 AND archived_at IS NULL",
      [restaurant],
    );
    if (
      usage.count >= 500 ||
      usage.total + file.size >
        Number(process.env.CMS_STORAGE_LIMIT_MB || 512) * 1024 * 1024
    )
      throw new Error("Limite de la médiathèque atteinte.");
    let data = Buffer.from(await file.arrayBuffer()),
      mime = file.type,
      width: number | null = null,
      height: number | null = null;
    const id = randomUUID();
    let name: string, kind: "image" | "video";
    if (["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      if (data.length > limits.imageBytes)
        throw new Error("Image limitée à 8 Mo.");
      const sharp = (await import("sharp")).default;
      const output = await sharp(data, {
        failOn: "error",
        limitInputPixels: 40e6,
      })
        .rotate()
        .resize({
          width: 2000,
          height: 2000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      data = output.data;
      width = output.info.width;
      height = output.info.height;
      mime = "image/webp";
      name = `${id}.webp`;
      kind = "image";
    } else if (
      (mime === "video/mp4" && data.subarray(4, 8).toString() === "ftyp") ||
      (mime === "video/webm" &&
        data.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    ) {
      if (data.length > limits.videoBytes)
        throw new Error("Vidéo limitée à 40 Mo.");
      name = `${id}.${mime === "video/mp4" ? "mp4" : "webm"}`;
      kind = "video";
    } else throw new Error("Formats acceptés : JPG, PNG, WebP, MP4 et WebM.");
    if (!data.length) throw new Error("Fichier vide.");
    if (demoEnabled()) {
      const target = localFile(restaurant, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data, { flag: "wx" });
    } else
      await storage().send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `${encodeURIComponent(restaurant)}/cms/${name}`,
          Body: data,
          ContentType: mime,
        }),
      );
    await db.query(
      "INSERT INTO cms_media(id,restaurant_id,kind,file,mime,size,width,height,original_name,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        id,
        restaurant,
        kind,
        name,
        mime,
        data.length,
        width,
        height,
        file.name.slice(0, 200),
        actor,
      ],
    );
    return {
      id,
      kind,
      file: name,
      url: mediaUrl(name),
      mime,
      size: data.length,
      width,
      height,
    };
  }
  async function readSiteMedia(db: DB, file: string, range: string | null) {
    if (!FILE_NAME.test(file)) throw new Error("Média introuvable.");
    const row = await one<{ mime: string; size: number }>(
      db,
      "SELECT mime,size FROM cms_media WHERE file=$1 AND restaurant_id=$2",
      [file, restaurant],
    );
    let start = 0,
      end = row.size - 1,
      partial = false;
    const match = /^bytes=(\d*)-(\d*)$/.exec(range || "");
    if (match && (match[1] || match[2])) {
      partial = true;
      if (match[1]) {
        start = Number(match[1]);
        end = match[2]
          ? Math.min(Number(match[2]), end)
          : Math.min(start + 4 * 1024 * 1024 - 1, end);
      } else start = Math.max(0, row.size - Number(match[2]));
      if (!Number.isSafeInteger(start) || start > end || start >= row.size)
        return { status: 416, size: row.size, type: row.mime };
    }
    let data: Uint8Array;
    if (demoEnabled())
      data = new Uint8Array(
        (await readFile(localFile(restaurant, file))).subarray(start, end + 1),
      );
    else {
      const result = await storage().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `${encodeURIComponent(restaurant)}/cms/${file}`,
          Range: `bytes=${start}-${end}`,
        }),
      );
      data = await result.Body!.transformToByteArray();
    }
    return {
      status: partial ? 206 : 200,
      size: row.size,
      type: row.mime,
      start,
      end,
      buffer: data,
    };
  }
  return { mediaUrl, listMedia, saveSiteMedia, readSiteMedia };
}
