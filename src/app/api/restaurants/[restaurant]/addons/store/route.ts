import { NextRequest } from "next/server";
import { z } from "zod";
import { addonStore, installFreeAddon, purchaseAddon, setAddonInstallation } from "@/features/addons/store-service";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
const action = z.object({
  action: z.enum(["install", "purchase", "set-installation"]),
  product: z.string().min(1).max(64),
  installed: z.boolean().optional(),
});
export async function GET(_req: NextRequest, context: Context) {
  try {
    return json(await addonStore((await context.params).restaurant));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await context.params;
    const body = action.parse(await readBody(req));
    if (body.action === "set-installation") {
      if (body.installed === undefined) throw new Error("État d’installation manquant.");
      return json(await setAddonInstallation(restaurant, body.product, body.installed));
    }
    return json(body.action === "install"
      ? await installFreeAddon(restaurant, body.product)
      : await purchaseAddon(restaurant, body.product));
  } catch (error) {
    return failure(error);
  }
}
