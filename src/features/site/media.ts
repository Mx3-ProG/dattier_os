import {
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { rows, demoEnabled, type DB } from "@/infrastructure/database/db";
import { s3Client } from "@/infrastructure/storage/s3";
export function imageType(data: Buffer) {
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255)
    return "image/jpeg";
  if (
    data.subarray(0, 4).toString() === "RIFF" &&
    data.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  throw new Error("Image PNG, JPEG ou WebP requise.");
}
function localPath(key: string) {
  const root = path.resolve(
    process.env.ATACUISINE_DATA_DIR || ".data/atacuisine-demo",
    "site-media",
  );
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) throw new Error("Chemin invalide.");
  return target;
}
export async function saveAsset(db: DB, r: string, data: Buffer) {
  if (!data.length || data.length > 8 * 1024 * 1024)
    throw new Error("Image trop volumineuse.");
  const contentType = imageType(data),
    id = randomUUID(),
    key = `${r}/media/${id}`;
  if (demoEnabled()) {
    const file = localPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { flag: "wx" });
  } else
    await s3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  await db.query(
    "INSERT INTO site_assets(id,restaurant_id,object_key,content_type,bytes) VALUES($1,$2,$3,$4,$5)",
    [id, r, key, contentType, data.length],
  );
  return { id, url: `/api/media/${r}/${id}` };
}
/** Contrôle dans la transaction, lecture du stockage après sa fermeture. */
export async function resolveAsset(db: DB, r: string, id: string) {
  const assets = await rows<{ object_key: string; content_type: string }>(
    db,
    "SELECT a.object_key,a.content_type FROM site_assets a JOIN site_documents s ON s.restaurant_id=a.restaurant_id WHERE a.id=$1 AND a.restaurant_id=$2 AND s.published::text LIKE '%'||a.id||'%'",
    [id, r],
  );
  if (!assets.length) return null;
  return { key: assets[0].object_key, type: assets[0].content_type };
}
export async function openAsset(key: string): Promise<BodyInit> {
  if (demoEnabled()) return new Uint8Array(await readFile(localPath(key)));
  const result = await s3Client().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
  return result.Body!.transformToWebStream();
}
