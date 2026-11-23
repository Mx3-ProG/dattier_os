import * as fs from "node:fs/promises";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { demoEnabled } from "@/infrastructure/database/db";
import { s3Client } from "@/infrastructure/storage/s3";
import { databaseContext } from "@/infrastructure/database/context";
function objectKey(file: string) {
  const r = databaseContext.getStore()?.restaurantId;
  const prefix = `@s3/${encodeURIComponent(r || "")}/`;
  if (!r || !file.startsWith(prefix) || file.includes(".."))
    throw new Error("Archive hors établissement.");
  return file.slice(4);
}
export async function mkdir(dir: string, opts: { recursive: boolean }) {
  if (dir.startsWith("@s3/")) {
    objectKey(dir + "/probe");
    s3Client();
    return;
  }
  if (!demoEnabled()) throw new Error("Stockage local désactivé.");
  await fs.mkdir(dir, opts);
}
export async function writeFile(
  file: string,
  content: string,
  opts: { flag: string; mode: number },
) {
  if (!file.startsWith("@s3/")) {
    if (!demoEnabled()) throw new Error("Stockage local désactivé.");
    return fs.writeFile(file, content, opts);
  }
  try {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: objectKey(file),
        Body: content,
        ContentType: "application/json",
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  } catch (e) {
    if (
      (e as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 412
    ) {
      const err = new Error("Archive existante.") as NodeJS.ErrnoException;
      err.code = "EEXIST";
      throw err;
    }
    throw e;
  }
}
export async function readFile(file: string, encoding: "utf8") {
  if (!file.startsWith("@s3/")) {
    if (!demoEnabled()) throw new Error("Stockage local désactivé.");
    return fs.readFile(file, encoding);
  }
  const result = await s3Client().send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: objectKey(file),
    }),
    { abortSignal: AbortSignal.timeout(30000) },
  );
  return result.Body!.transformToString("utf8");
}
export async function chmod(file: string, mode: number) {
  if (file.startsWith("@s3/")) {
    objectKey(file);
    return;
  }
  if (!demoEnabled()) throw new Error("Stockage local désactivé.");
  await fs.chmod(file, mode);
}
export async function unlink(file: string) {
  if (file.startsWith("@s3/")) {
    await s3Client().send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: objectKey(file),
      }),
    );
    return;
  }
  if (!demoEnabled()) throw new Error("Stockage local désactivé.");
  await fs.unlink(file);
}
