/* Stockage privé des justificatifs : jamais servis sans contrôle des droits. */
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { demoEnabled } from "@/lib/database/db";

function storage() {
  if (!process.env.S3_BUCKET)
    throw new Error("Stockage des justificatifs non configuré.");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "eu-west-3",
    forcePathStyle: process.env.S3_PATH_STYLE === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
function localPath(key: string) {
  const root = path.resolve(
    process.env.ATACUISINE_DATA_DIR || ".data/atacuisine-demo",
    "finance-documents",
  );
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) throw new Error("Chemin invalide.");
  return target;
}
export async function saveDocument(key: string, data: Buffer, type: string) {
  if (demoEnabled()) {
    const file = localPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { flag: "wx" });
    return;
  }
  await storage().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: type,
      IfNoneMatch: "*",
    }),
  );
}
export async function loadDocument(key: string) {
  if (demoEnabled()) return new Uint8Array(await readFile(localPath(key)));
  const result = await storage().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
  return result.Body?.transformToByteArray();
}
