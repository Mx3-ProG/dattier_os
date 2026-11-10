import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestContext } from "@/features/ops-security/context";
import { authenticated, failure } from "@/features/platform/http";
import { fecRows } from "@/features/billing/service";
import { fecFile } from "@/features/billing/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    const { from, to } = z
      .object({ from: z.iso.date(), to: z.iso.date() })
      .refine((p) => p.from <= p.to, "Période invalide.")
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const rows = await authenticated(restaurant, (db, user) =>
      fecRows(db, restaurant, user, from, to),
    );
    return new NextResponse(fecFile(rows), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="ecritures-${from}-${to}.txt"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/finance/fec",
  routeGET,
);
