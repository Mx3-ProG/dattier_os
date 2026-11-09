import { requirePlan } from "@/features/platform/entitlements";
import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticated, failure } from "@/features/platform/http";
import { exportCsv } from "@/features/integrations/exports";
async function routeGET(
  req: NextRequest,
  c: { params: Promise<{ restaurant: string }> },
) {
  try {
    const { restaurant } = await c.params;
    const a = z
      .object({
        kind: z.enum(["sales", "time_entries"]),
        from: z.iso.date(),
        to: z.iso.date(),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    if (a.from > a.to || Date.parse(a.to) - Date.parse(a.from) > 366 * 86400000)
      throw new Error("Période invalide.");
    const csv = await authenticated(restaurant, async (db, user) => {
      if (a.kind === "sales") await requirePlan(db, restaurant, 39);
      return exportCsv(db, restaurant, user, a.kind, a.from, a.to);
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="atacuisine-${a.kind}-${a.from}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/exports",
  routeGET,
);
