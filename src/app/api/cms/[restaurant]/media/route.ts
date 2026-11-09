import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest } from "next/server";
import {
  authenticated,
  assertOrigin,
  json,
  failure,
} from "@/features/platform/http";
import { optimizeMedia, reserveMediaJob } from "@/features/cms/media-optimizer";
import { cmsMedia, limits } from "@/features/cms/media";
import { website } from "@/features/cms/service";
import { log } from "@/features/orders/service";
import { demoEnabled } from "@/lib/database/db";
async function routePOST(
  req: NextRequest,
  c: { params: Promise<{ restaurant: string }> },
) {
  let release: (() => void) | undefined;
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    await authenticated(restaurant, (db, user) =>
      website(restaurant).siteScope(db, user),
    );
    release = reserveMediaJob();
    const max = limits.videoBytes + 100000;
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Fichier absent.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.length;
      if (bytes > max) {
        await reader.cancel();
        throw new Error("Fichier trop volumineux.");
      }
      chunks.push(result.value);
    }
    const form = await new Request(req.url, {
        method: "POST",
        headers: req.headers,
        body: Buffer.concat(chunks),
      }).formData(),
      file = form.get("file");
    if (!(file instanceof File)) throw new Error("Ajoutez un fichier.");
    // En production, la vidéo part au groupe de workers media : le serveur web reste libre.
    // La démonstration n'a pas de worker et garde le traitement direct.
    if (file.type.startsWith("video/") && !demoEnabled()) {
      if (
        !["video/mp4", "video/webm", "video/quicktime"].includes(file.type) ||
        !file.size ||
        file.size > limits.videoBytes
      )
        throw new Error("Vidéo MP4, MOV ou WebM limitée à 100 Mo.");
      const cms = cmsMedia(restaurant);
      const incoming = await cms.storeIncoming(file);
      try {
        return json(
          await authenticated(restaurant, async (db, user) => {
            await db.exec("SET LOCAL ROLE atacuisine_app");
            await website(restaurant).siteScope(db, user);
            const saved = await cms.queueVideo(db, incoming, file, user.id);
            await log(db, restaurant, user.id, "Site : média importé", saved.id);
            return saved;
          }),
        );
      } catch (error) {
        await cms.removeIncoming(incoming.key);
        throw error;
      }
    }
    const optimized = await optimizeMedia(file);
    return json(
      await authenticated(restaurant, async (db, user) => {
        await db.exec("SET LOCAL ROLE atacuisine_app");
        await website(restaurant).siteScope(db, user);
        const saved = await cmsMedia(restaurant).saveSiteMedia(
          db,
          optimized,
          user.id,
        );
        await log(db, restaurant, user.id, "Site : média importé", saved.id);
        return saved;
      }),
    );
  } catch (e) {
    return failure(e);
  } finally {
    release?.();
  }
}

export const POST = withRequestContext(
  "/api/cms/[restaurant]/media",
  routePOST,
);

export const runtime = "nodejs";
export const maxDuration = 240;
