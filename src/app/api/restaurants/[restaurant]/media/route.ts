import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest } from "next/server";
import {
  authenticated,
  assertOrigin,
  json,
  failure,
} from "@/features/platform/http";
import { scope } from "@/infrastructure/auth/session";
import { requirePermission } from "@/core/permissions";
import { saveAsset } from "@/features/site/media";
async function routePOST(
  req: NextRequest,
  c: { params: Promise<{ restaurant: string }> },
) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    if (Number(req.headers.get("content-length") || 0) > 8 * 1024 * 1024)
      throw new Error("Image trop volumineuse.");
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Image absente.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Image trop volumineuse.");
      }
      chunks.push(value);
    }
    return json(
      await authenticated(restaurant, async (db, user) => {
        const u = await scope(db, user, restaurant);
        requirePermission(u.roles ?? u.role, "catalog");
        return saveAsset(db, restaurant, Buffer.concat(chunks));
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/media",
  routePOST,
);
