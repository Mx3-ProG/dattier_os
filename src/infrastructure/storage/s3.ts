import { S3Client } from "@aws-sdk/client-s3";

let cached: S3Client | null = null;

/** True when S3-compatible storage is configured via environment. */
export function s3Configured() {
  return !!process.env.S3_BUCKET;
}

/** Bucket name; throws when storage is not configured. */
export function s3Bucket() {
  if (!process.env.S3_BUCKET) throw new Error("Stockage non configuré.");
  return process.env.S3_BUCKET;
}

/** Shared, lazily created S3 client. Created once per process. */
export function s3Client() {
  if (!process.env.S3_BUCKET) throw new Error("Stockage non configuré.");
  if (!cached) {
    cached = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "eu-west-3",
      forcePathStyle: process.env.S3_PATH_STYLE === "true",
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return cached;
}
