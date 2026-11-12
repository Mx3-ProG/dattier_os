import { cookies, headers as nextHeaders } from "next/headers";
import { actor } from "@/infrastructure/auth/session";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { getDb, productionEnabled, type DB } from "@/infrastructure/database/db";
import {
  clientAddress,
  isAutomated,
  isPrefetch,
  normalizePath,
  refusalSignal,
  resolveSite,
  transientFingerprint,
} from "./collector";
import { geoFromHeaders, type ApproximateGeo } from "./geo";

/** Écriture d’une visite validée. Toute la logique de comptage est dans app.analytics_ingest. */
export async function recordVisit(
  db: DB,
  visit: { restaurant: string; site: string; fingerprint: string; path: string; geo: ApproximateGeo },
) {
  const { rows } = await db.query<{ status: string }>(
    "SELECT app.analytics_ingest($1,$2,$3,$4,$5,$6,$7,$8,$9) AS status",
    [
      visit.restaurant,
      visit.site,
      visit.fingerprint,
      visit.path,
      visit.geo.country,
      visit.geo.region,
      visit.geo.city,
      visit.geo.lat,
      visit.geo.lng,
    ],
  );
  return rows[0]?.status ?? "disabled";
}
const platformHosts = (requestHost: string) => {
  if (productionEnabled() && process.env.APP_URL) return [new URL(process.env.APP_URL).hostname];
  // Mode local : l’application répond sur l’hôte de développement.
  return ["localhost", "127.0.0.1", "[::1]", requestHost.split(":")[0].toLowerCase()];
};
/** Hors transaction : la lecture de session emprunte sa propre connexion. */
const sessionProfile = async () => {
  const jar = await cookies();
  if (!jar.has("atacuisine_session") && !jar.has("atacuisine_identity")) return null;
  return (await actor().catch(() => null))?.id ?? null;
};
const isStaff = async (db: DB, restaurant: string, profile: string | null) => {
  if (!profile) return false;
  const { rows } = await db.query<{ internal: boolean }>(
    "SELECT app.analytics_is_internal($1,$2) AS internal",
    [restaurant, profile],
  );
  return rows[0]?.internal === true;
};
/** Collecte d’une page vue. Ne lève jamais vers le visiteur : la mesure ne doit gêner aucune navigation. */
export async function collect(body: unknown) {
  const headers = await nextHeaders();
  const rawPath = (body as { path?: unknown } | null)?.path;
  const db = await getDb();
  const identity = await resolveSite({
    host: headers.get("host") ?? "",
    origin: headers.get("origin"),
    platformHosts: platformHosts(headers.get("host") ?? ""),
    path: rawPath,
    resolveDomain: async (host) =>
      (await db.query<{ restaurant: string | null }>("SELECT app.resolve_domain($1) AS restaurant", [host])).rows[0]?.restaurant ?? null,
  });
  if (!identity) return "rejected";
  const path = normalizePath(rawPath, identity.platform ? identity.restaurant : null);
  const userAgent = headers.get("user-agent");
  const profile = await sessionProfile();
  return withDatabaseContext({ restaurantId: identity.restaurant, public: true }, async () =>
    (await getDb()).transaction(async (tx) => {
      const filtered =
        !path || isAutomated(userAgent) || isPrefetch(headers) || refusalSignal(headers) ||
        (await isStaff(tx, identity.restaurant, profile));
      if (filtered) {
        await tx.query("SELECT app.analytics_record_filtered($1,$2)", [identity.restaurant, identity.site]);
        return "filtered";
      }
      return recordVisit(tx, {
        restaurant: identity.restaurant,
        site: identity.site,
        fingerprint: transientFingerprint(clientAddress(headers), userAgent!),
        path: path!,
        geo: geoFromHeaders(headers),
      });
    }),
  );
}
