import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { rows, type DB } from "@/infrastructure/database/db";
import { mediaObjectKey } from "./media";
import { s3Client } from "@/infrastructure/storage/s3";
import { optimizeMedia } from "./media-optimizer";

type Run = <T>(fn: (tx: DB) => Promise<T>) => Promise<T>;

/**
 * Transcode une vidéo déposée par le serveur web. Aucune transaction n'est ouverte
 * pendant le transcodage : il dépasse largement le statement_timeout de 15 secondes.
 * Un fichier refusé par l'optimiseur ne réussira jamais : il échoue sans nouvel essai.
 * Une panne de stockage relance le job.
 */
export async function transcodeMedia(run: Run, restaurant: string, id: string) {
  const media = (
    await run((tx) =>
      rows<{
        file: string;
        original_name: string;
        source_key: string;
        source_mime: string;
      }>(
        tx,
        "SELECT file,original_name,source_key,source_mime FROM cms_media WHERE id=$1 AND restaurant_id=$2 AND status='processing'",
        [id, restaurant],
      ),
    )
  )[0];
  if (!media) return;
  const store = s3Client(),
    Bucket = process.env.S3_BUCKET;
  const source = await store.send(
    new GetObjectCommand({ Bucket, Key: media.source_key }),
  );
  const input = await source.Body!.transformToByteArray();
  const removeSource = () =>
    store
      .send(new DeleteObjectCommand({ Bucket, Key: media.source_key }))
      .catch(() => undefined);
  let optimized;
  try {
    optimized = await optimizeMedia(
      new File([Buffer.from(input)], media.original_name, {
        type: media.source_mime,
      }),
    );
  } catch (error) {
    await run((tx) =>
      tx.query(
        "UPDATE cms_media SET status='failed',processing_error=$3,source_key=NULL WHERE id=$1 AND restaurant_id=$2",
        [
          id,
          restaurant,
          (error instanceof Error ? error.message : "Vidéo illisible.").slice(0, 300),
        ],
      ),
    );
    await removeSource();
    return;
  }
  await store.send(
    new PutObjectCommand({
      Bucket,
      Key: mediaObjectKey(restaurant, media.file),
      Body: optimized.data,
      ContentType: optimized.mime,
    }),
  );
  await run((tx) =>
    tx.query(
      "UPDATE cms_media SET status='ready',mime=$3,size=$4,width=$5,height=$6,source_key=NULL,source_mime=NULL,processing_error=NULL WHERE id=$1 AND restaurant_id=$2",
      [id, restaurant, optimized.mime, optimized.data.length, optimized.width, optimized.height],
    ),
  );
  await removeSource();
}
