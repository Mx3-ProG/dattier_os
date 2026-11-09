import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import { authenticated, failure, json } from "@/features/platform/http";
import { financeDashboard, periodQuery } from "@/features/finance/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    const query = periodQuery.parse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    return json(
      await authenticated(restaurant, (db, user) =>
        financeDashboard(db, restaurant, user, query),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/finance/dashboard",
  routeGET,
);
