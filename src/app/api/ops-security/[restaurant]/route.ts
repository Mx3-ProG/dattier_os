import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest } from "next/server";
import {
  authenticated,
  assertOrigin,
  readBody,
  json,
  failure,
} from "@/features/platform/http";
import { nestedDatabase } from "@/infrastructure/database/nested";
import {
  securityScope,
  overview,
  listEvents,
  listIncidents,
  listRemediations,
  listArchives,
  exportArchive,
  diagnose,
  securityAction,
} from "@/features/ops-security/service";
type Context = { params: Promise<{ restaurant: string }> };
async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(
      await authenticated(restaurant, async (tx, user) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        const db = nestedDatabase(tx),
          scope = await securityScope(db, user, restaurant),
          params = req.nextUrl.searchParams,
          view = params.get("view") || "overview";
        if (view === "events")
          return listEvents(db, scope, Object.fromEntries(params));
        if (view === "incidents") return listIncidents(db, scope);
        if (view === "remediations") return listRemediations(db, scope);
        if (view === "archives") return listArchives(db, scope);
        if (view === "archive")
          return exportArchive(db, scope, params.get("day") || "");
        if (view === "diagnose")
          return diagnose(db, scope, params.get("event") || "");
        return overview(db, scope);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params,
      body = await readBody(req);
    return json(
      await authenticated(restaurant, async (tx, user) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        const db = nestedDatabase(tx);
        return securityAction(
          db,
          await securityScope(db, user, restaurant),
          body,
        );
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/ops-security/[restaurant]",
  routeGET,
);

export const POST = withRequestContext(
  "/api/ops-security/[restaurant]",
  routePOST,
);
