import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest } from "next/server";
import {
  authenticated,
  assertOrigin,
  json,
  failure,
} from "@/features/platform/http";
import { cmsMedia, limits } from "@/features/cms/media";
import { website } from "@/features/cms/service";
import { log } from "@/features/orders/service";
async function routePOST(
  req: NextRequest,
  c: { params: Promise<{ restaurant: string }> },
) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    await authenticated(restaurant, (db, user) =>
      website(restaurant).siteScope(db, user),
    );
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
    return json(
      await authenticated(restaurant, async (db, user) => {
        await db.exec("SET LOCAL ROLE dattier_app");
        await website(restaurant).siteScope(db, user);
        const saved = await cmsMedia(restaurant).saveSiteMedia(
          db,
          file,
          user.id,
        );
        await log(db, restaurant, user.id, "Site : média importé", saved.id);
        return saved;
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

export const POST = withRequestContext(
  "/api/cms/[restaurant]/media",
  routePOST,
);
