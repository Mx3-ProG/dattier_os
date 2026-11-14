import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest } from "next/server";
import {
  authenticated,
  assertOrigin,
  readBody,
  json,
  failure,
} from "@/features/platform/http";
import {
  getSuperAdminDashboard,
  performSuperAdminAction,
} from "@/features/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function routeGET() {
  try {
    return json(
      await authenticated(undefined, async (db, user) => {
        return getSuperAdminDashboard(db, user);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

async function routePOST(req: NextRequest) {
  try {
    await assertOrigin(req);
    const body = await readBody(req);
    return json(
      await authenticated(undefined, async (db, user) => {
        return performSuperAdminAction(db, user, body);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext("/api/platform/admin", routeGET);
export const POST = withRequestContext("/api/platform/admin", routePOST);
