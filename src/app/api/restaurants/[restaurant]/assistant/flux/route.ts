import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { withRequestContext } from "@/features/ops-security/context";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";
import {
  fluxApply,
  fluxApplySchema,
  fluxBuild,
  fluxBuildSchema,
  fluxState,
} from "@/features/assistant/flux/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Context = { params: Promise<{ restaurant: string }> };

/* FLUX sert tous les métiers qui ont un site : pas de garde « restauration »
   ici, seuls les droits « website » du CMS s’appliquent. */
async function routeGET(_req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(await fluxState(restaurant));
  } catch (e) {
    return failure(e);
  }
}

async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    const body = await readBody(req, 60000);
    if (body?.kind === "apply") {
      const result = await fluxApply(restaurant, fluxApplySchema.parse(body));
      if (result.published) revalidatePath(`/r/${restaurant}`, "layout");
      return json(result);
    }
    return json(await fluxBuild(restaurant, fluxBuildSchema.parse(body)));
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext("/api/restaurants/[restaurant]/assistant/flux", routeGET);
export const POST = withRequestContext("/api/restaurants/[restaurant]/assistant/flux", routePOST);
