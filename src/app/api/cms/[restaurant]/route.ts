import { withRequestContext } from "@/features/ops-security/context";
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import {
  authenticated,
  assertOrigin,
  readBody,
  json,
  failure,
} from "@/features/platform/http";
import { website } from "@/features/cms/service";
import { limits } from "@/features/cms/media";
type Context = { params: Promise<{ restaurant: string }> };
async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(
      await authenticated(restaurant, async (db, user) => {
        await db.exec("SET LOCAL ROLE atacuisine_app");
        const cms = website(restaurant),
          s = await cms.siteScope(db, user);
        const view = req.nextUrl.searchParams.get("view") || "state";
        if (view === "versions") return cms.versions(db);
        if (view === "media") return { items: await cms.listMedia(db), limits };
        return cms.editorState(db, s);
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
      body = await readBody(req, 400000);
    const result = await authenticated(restaurant, async (db, user) => {
      await db.exec("SET LOCAL ROLE atacuisine_app");
      const cms = website(restaurant);
      return cms.siteAction(db, await cms.siteScope(db, user), body);
    });
    if (["publish", "restore"].includes(body.op))
      revalidatePath(`/r/${restaurant}`, "layout");
    return json(result);
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext("/api/cms/[restaurant]", routeGET);

export const POST = withRequestContext("/api/cms/[restaurant]", routePOST);
