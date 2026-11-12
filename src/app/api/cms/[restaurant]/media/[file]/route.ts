import { requirePlan } from "@/features/platform/entitlements";
import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest, NextResponse } from "next/server";
import { actor, type Actor } from "@/infrastructure/auth/session";
import { getDb } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
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
    const media = cmsMedia(restaurant),
      range = req.headers.get("range"),
      database = await getDb();
    // Un média publié est public. Sinon, seul le personnel le prévisualise, dans son propre
    // contexte : le canal public n'a accès ni aux équipes ni aux brouillons.
    const open = await withDatabaseContext(
      { restaurantId: restaurant, public: true },
      () =>
        database.transaction(async (db) => {
          await db.exec("SET LOCAL ROLE atacuisine_app");
          await requirePlan(db, restaurant, 39);
          const config = await website(restaurant).getPublishedConfig(db);
          return JSON.stringify(config).includes(
            `/api/cms/${restaurant}/media/${file}`,
          )
            ? { published: true, ...(await media.resolveSiteMedia(db, file, range)) }
            : null;
        }),
    );
    const staff =
      open ??
      (user
        ? await withDatabaseContext(
            { restaurantId: restaurant, userId: user.id },
            () =>
              database.transaction(async (db) => {
                await db.exec("SET LOCAL ROLE atacuisine_app");
                await website(restaurant).siteScope(db, user);
                return {
                  published: false,
                  ...(await media.resolveSiteMedia(db, file, range)),
                };
              }),
          )
        : null);
    return await withDatabaseContext(
      { restaurantId: restaurant, public: true },
      async () => {
        const plan = staff;
        if (!plan) return new NextResponse(null, { status: 404 });
        if (plan.status === 416)
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${plan.size}` },
          });
        const { start, end } = plan as { start: number; end: number };
        // La transaction est fermée : le téléchargement ne retient aucune connexion.
        return new NextResponse(await media.openSiteMedia(file, start, end), {
          status: plan.status,
          headers: {
            "Content-Type": plan.type,
            "Accept-Ranges": "bytes",
            "Content-Length": String(end - start + 1),
            ...(plan.status === 206
              ? { "Content-Range": `bytes ${start}-${end}/${plan.size}` }
              : {}),
            "Cache-Control": plan.published
              ? "public, max-age=3600"
              : "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
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
