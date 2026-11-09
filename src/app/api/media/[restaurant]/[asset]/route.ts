import { requirePlan } from "@/features/platform/entitlements";
import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest, NextResponse } from "next/server";
import { withDatabaseContext } from "@/lib/database/context";
import { getDb } from "@/lib/database/db";
import { openAsset, resolveAsset } from "@/features/site/media";
async function routeGET(
  _: NextRequest,
  c: { params: Promise<{ restaurant: string; asset: string }> },
) {
  const { restaurant, asset } = await c.params;
  try {
    return await withDatabaseContext(
      { restaurantId: restaurant, public: true },
      async () => {
        const asset_ = await (
          await getDb()
        ).transaction(async (db) => {
          await requirePlan(db, restaurant, 69);
          return resolveAsset(db, restaurant, asset);
        });
        if (!asset_) return new NextResponse(null, { status: 404 });
        // Hors transaction : le téléchargement ne retient aucune connexion à la base.
        const body = await openAsset(asset_.key);
        return new NextResponse(body, {
          headers: {
            "Content-Type": asset_.type,
            "Cache-Control": "public, max-age=3600",
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
  "/api/media/[restaurant]/[asset]",
  routeGET,
);
