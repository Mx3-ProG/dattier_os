import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { rows, one, demoEnabled, type DB } from "@/infrastructure/database/db";
import { s3Client } from "@/infrastructure/storage/s3";
import { limits, optimizeMedia, type OptimizedMedia } from "./media-optimizer";
import { enqueue } from "@/features/platform/jobs";
export { limits } from "./media-optimizer";
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
  status: "processing" | "ready" | "failed";
  processing_error: string | null;
};
export const mediaObjectKey = (restaurant: string, file: string) =>
  `${encodeURIComponent(restaurant)}/cms/${file}`;
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
        "SELECT id,kind,file,mime,size,width,height,alt,original_name,created_at,status,processing_error FROM cms_media WHERE restaurant_id=$1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 500",
        [restaurant],
      )
    ).map((m) => ({ ...m, url: mediaUrl(m.file) }));
  }
  async function saveSiteMedia(
    db: DB,
    file: File | OptimizedMedia,
    actor: string,
  ) {
    const optimized = file instanceof File ? await optimizeMedia(file) : file;
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
      usage.total + optimized.data.length >
        Number(process.env.CMS_STORAGE_LIMIT_MB || 512) * 1024 * 1024
    )
      throw new Error("Limite de la médiathèque atteinte.");
    const { data, mime, width, height, kind } = optimized;
    const id = randomUUID();
    const name = `${id}.${optimized.extension}`;
    if (!data.length) throw new Error("Fichier vide.");
    if (demoEnabled()) {
      const target = localFile(restaurant, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data, { flag: "wx" });
    } else
      await s3Client().send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: mediaObjectKey(restaurant, name),
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
        optimized.originalName,
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
      originalSize: optimized.originalSize,
      savedBytes: Math.max(0, optimized.originalSize - data.length),
      width,
      height,
    };
  }
  /** Dépose l'original hors transaction ; le worker du groupe media le transcode. */
  async function storeIncoming(file: File) {
    const id = randomUUID(),
      key = `${encodeURIComponent(restaurant)}/cms/incoming/${id}`;
    await s3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      }),
    );
    return { id, key };
  }
  async function removeIncoming(key: string) {
    await s3Client()
      .send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }))
      .catch(() => undefined);
  }
  async function queueVideo(
    db: DB,
    incoming: { id: string; key: string },
    file: File,
    actor: string,
  ) {
    await one(db, "SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [
      restaurant,
    ]);
    const usage = await one<{ total: number; count: number }>(
      db,
      "SELECT coalesce(sum(size),0)::float AS total,count(*)::int AS count FROM cms_media WHERE restaurant_id=$1 AND archived_at IS NULL",
      [restaurant],
    );
    // Le quota compte déjà la taille maximale du résultat, ajustée à la fin du transcodage.
    if (
      usage.count >= 500 ||
      usage.total + limits.outputVideoBytes >
        Number(process.env.CMS_STORAGE_LIMIT_MB || 512) * 1024 * 1024
    )
      throw new Error("Limite de la médiathèque atteinte.");
    const name = `${incoming.id}.mp4`;
    await db.query(
      "INSERT INTO cms_media(id,restaurant_id,kind,file,mime,size,original_name,created_by,status,source_key,source_mime) VALUES($1,$2,'video',$3,'video/mp4',$4,$5,$6,'processing',$7,$8)",
      [
        incoming.id,
        restaurant,
        name,
        limits.outputVideoBytes,
        file.name.slice(0, 200),
        actor,
        incoming.key,
        file.type,
      ],
    );
    await enqueue(db, restaurant, "media_transcode", incoming.id, {
      media: incoming.id,
    });
    return {
      id: incoming.id,
      kind: "video" as const,
      file: name,
      url: mediaUrl(name),
      mime: "video/mp4",
      size: file.size,
      originalSize: file.size,
      savedBytes: 0,
      status: "processing" as const,
    };
  }
  /** Décide quoi servir dans la transaction de contrôle d'accès, sans toucher au stockage. */
  async function resolveSiteMedia(db: DB, file: string, range: string | null) {
    if (!FILE_NAME.test(file)) throw new Error("Média introuvable.");
    const row = await one<{ mime: string; size: number }>(
      db,
      "SELECT mime,size FROM cms_media WHERE file=$1 AND restaurant_id=$2 AND status='ready'",
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
    return {
      status: partial ? 206 : 200,
      size: row.size,
      type: row.mime,
      start,
      end,
    };
  }
  /**
   * Flux du fichier, à ouvrir une fois la transaction fermée : une vidéo lente à
   * télécharger ne doit jamais retenir une connexion à la base.
   */
  async function openSiteMedia(file: string, start: number, end: number) {
    if (demoEnabled())
      return Readable.toWeb(
        createReadStream(localFile(restaurant, file), { start, end }),
      ) as ReadableStream;
    const result = await s3Client().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: mediaObjectKey(restaurant, file),
        Range: `bytes=${start}-${end}`,
      }),
    );
    return result.Body!.transformToWebStream();
  }
  return {
    mediaUrl,
    listMedia,
    saveSiteMedia,
    storeIncoming,
    removeIncoming,
    queueVideo,
    resolveSiteMedia,
    openSiteMedia,
  };
}
