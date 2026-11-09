import { NextRequest, NextResponse } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import { authenticated, failure } from "@/features/platform/http";
import { payrollExport } from "@/features/hr/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    const month = req.nextUrl.searchParams.get("month") || "";
    const csv = await authenticated(restaurant, (db, user) =>
      payrollExport(db, restaurant, user, month),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="variables-paie-${month}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/hr/export",
  routeGET,
);
