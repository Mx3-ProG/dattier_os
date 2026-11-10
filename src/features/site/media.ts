import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { rows, demoEnabled, type DB } from "@/lib/database/db";
function storage() {
  if (!process.env.S3_BUCKET)
    throw new Error("Stockage des médias non configuré.");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "eu-west-3",
    forcePathStyle: process.env.S3_PATH_STYLE === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
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
    await storage().send(
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
/** Aperçu pour le personnel : toute image envoyée pour son établissement, publiée ou non. */
export async function resolveStaffAsset(db: DB, r: string, id: string) {
  const assets = await rows<{ object_key: string; content_type: string }>(
    db,
    "SELECT object_key,content_type FROM site_assets WHERE id=$1 AND restaurant_id=$2",
    [id, r],
  );
  return assets.length ? { key: assets[0].object_key, type: assets[0].content_type } : null;
}
/** Contrôle dans la transaction, lecture du stockage après sa fermeture. */
export async function resolveAsset(db: DB, r: string, id: string) {
  // Avant la migration 151, seules les images du site publié sont publiques (comportement d'origine).
  const offers = (await rows<{ ok: boolean }>(db, "SELECT to_regprocedure('app.offer_media_public(text,text)') IS NOT NULL AS ok"))[0]?.ok;
  const assets = await rows<{ object_key: string; content_type: string }>(
    db,
    `SELECT a.object_key,a.content_type FROM site_assets a WHERE a.id=$1 AND a.restaurant_id=$2 AND (EXISTS (SELECT 1 FROM site_documents s WHERE s.restaurant_id=a.restaurant_id AND s.published::text LIKE '%'||a.id||'%')${offers ? " OR app.offer_media_public(a.restaurant_id,a.id)" : ""})`,
    [id, r],
  );
  if (!assets.length) return null;
  return { key: assets[0].object_key, type: assets[0].content_type };
}
export async function openAsset(key: string): Promise<BodyInit> {
  if (demoEnabled()) return new Uint8Array(await readFile(localPath(key)));
  const result = await storage().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
  return result.Body!.transformToWebStream();
}
