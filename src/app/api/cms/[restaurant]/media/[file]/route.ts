import { requirePlan } from "@/features/platform/entitlements";
import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest, NextResponse } from "next/server";
import { actor, type Actor } from "@/lib/auth/session";
import { getDb } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { website } from "@/features/cms/service";
import { cmsMedia } from "@/features/cms/media";
async function routeGET(
  req: NextRequest,
  c: { params: Promise<{ restaurant: string; file: string }> },
) {
  const { restaurant, file } = await c.params;
  try {
    let user: Actor | undefined;
    try {
      user = await actor();
    } catch {}
    return await withDatabaseContext(
      { restaurantId: restaurant, public: true, userId: user?.id },
      async () => {
        return (await getDb()).transaction(async (db) => {
          await db.exec("SET LOCAL ROLE dattier_app");
          await requirePlan(db, restaurant, 69);
          const cms = website(restaurant);
          const config = await cms.getPublishedConfig(db);
          const published = JSON.stringify(config).includes(
            `/api/cms/${restaurant}/media/${file}`,
          );
          if (!published) {
            if (!user) return new NextResponse(null, { status: 404 });
            await cms.siteScope(db, user);
          }
          const result = await cmsMedia(restaurant).readSiteMedia(
            db,
            file,
            req.headers.get("range"),
          );
          if (result.status === 416)
            return new NextResponse(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${result.size}` },
            });
          return new NextResponse(Buffer.from(result.buffer!), {
            status: result.status,
            headers: {
              "Content-Type": result.type,
              "Accept-Ranges": "bytes",
              "Content-Length": String(result.buffer!.length),
              ...(result.status === 206
                ? {
                    "Content-Range": `bytes ${result.start}-${result.end}/${result.size}`,
                  }
                : {}),
              "Cache-Control": published
                ? "public, max-age=3600"
                : "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        });
      },
    );
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export const GET = withRequestContext(
  "/api/cms/[restaurant]/media/[file]",
  routeGET,
);
