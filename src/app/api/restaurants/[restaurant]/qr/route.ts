import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import {
  assertOrigin,
  authenticated,
  failure,
  json,
  readBody,
} from "@/features/platform/http";
import { scope } from "@/lib/auth/session";
import { rows } from "@/lib/database/db";
import { qrAction, qrActionSchema, qrPortfolio } from "@/features/qr/service";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(
      await authenticated(restaurant, async (db, user) => {
        const member = await scope(db, user, restaurant);
        // Clock-in page: who is clocking in, and what they did last.
        if (req.nextUrl.searchParams.get("view") === "clock") {
          const last = await rows<{ event: string; created_at: string }>(
            db,
            "SELECT event,created_at FROM time_entries WHERE profile_id=$1 AND restaurant_id=$2 ORDER BY created_at DESC LIMIT 1",
            [member.id, restaurant],
          );
          const r = await rows<{ name: string }>(
            db,
            "SELECT name FROM restaurants WHERE id=$1",
            [restaurant],
          );
          return {
            name: member.name,
            restaurant: r[0]?.name ?? "",
            last: last[0] ?? null,
          };
        }
        return qrPortfolio(db, restaurant, member);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const body = qrActionSchema.parse(await readBody(req));
    return json(
      await authenticated(restaurant, async (db, user) =>
        qrAction(db, restaurant, await scope(db, user, restaurant), body),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext("/api/restaurants/[restaurant]/qr", routeGET);
export const POST = withRequestContext("/api/restaurants/[restaurant]/qr", routePOST);
