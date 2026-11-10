import { NextRequest } from "next/server";
import { z } from "zod";
import { periodQuery, resolvePeriod } from "@/features/analytics/period";
import {
  purgeStatistics,
  readLive,
  readOverview,
  readSettings,
  saveSettings,
} from "@/features/analytics/service";
import { log } from "@/features/orders/service";
import { assertOrigin, authenticated, failure, json, readBody } from "@/features/platform/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string }> };
const siteOf = (req: NextRequest) => {
  const site = req.nextUrl.searchParams.get("site");
  return site ? z.string().max(253).regex(/^[a-z0-9.[\]:-]+$/).parse(site) : null;
};
export async function GET(req: NextRequest, context: Context) {
  try {
    const { restaurant } = await context.params;
    const site = siteOf(req);
    const params = req.nextUrl.searchParams;
    if (params.get("view") === "live") {
      const since = z.iso.datetime({ offset: true }).parse(params.get("since"));
      return json(await authenticated(restaurant, (db, user) => readLive(db, user, restaurant, site, since)));
    }
    const period = resolvePeriod(
      periodQuery.parse({
        range: params.get("range") ?? undefined,
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
      }),
    );
    return json(await authenticated(restaurant, (db, user) => readOverview(db, user, restaurant, period, site)));
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(req: NextRequest, context: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await context.params;
    const body = await readBody(req);
    return json(
      await authenticated(restaurant, async (db, user) => {
        const settings = await saveSettings(db, user, restaurant, body);
        await log(
          db,
          restaurant,
          user.id,
          "Mesure d’audience modifiée",
          `${settings.collection_enabled ? "activée" : "désactivée"} · ${settings.consent_mode} · ${settings.retention_days} j`,
        );
        return settings;
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
const purge = z.object({ confirm: z.literal("SUPPRIMER") }).strict();
export async function DELETE(req: NextRequest, context: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await context.params;
    purge.parse(await readBody(req));
    return json(
      await authenticated(restaurant, async (db, user) => {
        await purgeStatistics(db, user, restaurant);
        await log(db, restaurant, user.id, "Statistiques d’audience supprimées", "toutes périodes");
        return readSettings(db, restaurant);
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
