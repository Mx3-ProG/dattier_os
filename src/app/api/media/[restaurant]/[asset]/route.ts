import { requirePlan } from "@/features/platform/entitlements";
import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest, NextResponse } from "next/server";
import { withDatabaseContext } from "@/lib/database/context";
import { getDb } from "@/lib/database/db";
import { openAsset, resolveAsset, resolveStaffAsset } from "@/features/site/media";
import { actor, scope } from "@/lib/auth/session";
import { MEDIA_CSP } from "@/lib/security/csp";
async function staffPreview(restaurant: string, asset: string) {
  const user = await actor().catch(() => null);
  if (!user) return null;
  return withDatabaseContext({ restaurantId: restaurant, userId: user.id }, async () =>
    (await getDb()).transaction(async (db) => {
      await db.exec("SET LOCAL ROLE atacuisine_app");
      await scope(db, user, restaurant);
      return resolveStaffAsset(db, restaurant, asset);
    }),
  ).catch(() => null);
}
async function routeGET(
  _: NextRequest,
  c: { params: Promise<{ restaurant: string; asset: string }> },
) {
  const { restaurant, asset } = await c.params;
  try {
    const published = await withDatabaseContext(
      { restaurantId: restaurant, public: true },
      async () =>
        (await getDb()).transaction(async (db) => {
          await requirePlan(db, restaurant, 39);
          return resolveAsset(db, restaurant, asset);
        }),
    );
    // Image non publiée (produit ou service en préparation) : aperçu réservé au personnel.
    const staff = published ? null : await staffPreview(restaurant, asset);
    const found = published ?? staff;
    if (!found) return new NextResponse(null, { status: 404 });
    // Hors transaction : le téléchargement ne retient aucune connexion à la base.
    const body = await openAsset(found.key);
    return new NextResponse(body, {
      headers: {
        "Content-Type": found.type,
        "Cache-Control": staff ? "private, no-store" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": MEDIA_CSP,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export const GET = withRequestContext(
  "/api/media/[restaurant]/[asset]",
  routeGET,
);
