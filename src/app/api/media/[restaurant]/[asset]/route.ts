import { requirePlan } from "@/features/platform/entitlements";
import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest, NextResponse } from "next/server";
import { withDatabaseContext } from "@/lib/database/context";
import { getDb } from "@/lib/database/db";
import { readAsset } from "@/features/site/media";
async function routeGET(
  _: NextRequest,
  c: { params: Promise<{ restaurant: string; asset: string }> },
) {
  const { restaurant, asset } = await c.params;
  try {
    return await withDatabaseContext(
      { restaurantId: restaurant, public: true },
      async () => {
        const result = await (
          await getDb()
        ).transaction(async (db) => {
          await requirePlan(db, restaurant, 69);
          return readAsset(db, restaurant, asset);
        });
        if (!result?.body) return new NextResponse(null, { status: 404 });
        return new NextResponse(Buffer.from(result.body), {
          headers: {
            "Content-Type": result.type,
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
