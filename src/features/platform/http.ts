import { requirePlan } from "@/features/platform/entitlements";
import { registerPresence } from "@/features/ops-security/presence";
import { recordFailure } from "@/features/ops-security/http";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { actor, type Actor } from "@/lib/auth/session";
import { getDb, demoEnabled, type DB } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { log } from "@/features/orders/service";
import { appOrigin } from "@/lib/auth/oidc";
export const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
export async function readBody(req: Request, maxBytes = 50000) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Corps de requête absent.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Requête trop volumineuse.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function assertOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) throw new Error("Origine non autorisée.");
  if (demoEnabled()) {
    if (
      new URL(origin).host !== req.headers.get("host") ||
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)
    )
      throw new Error("Origine non autorisée.");
  } else if (origin !== appOrigin()) {
    const { rows } = await (
      await getDb()
    ).query("SELECT app.resolve_domain($1) AS restaurant", [
      new URL(origin).hostname,
    ]);
    if (
      new URL(origin).protocol !== "https:" ||
      new URL(origin).host !== req.headers.get("host") ||
      !rows[0]?.restaurant
    )
      throw new Error("Origine non autorisée.");
  }
}
export async function authenticated<T>(
  restaurant: string | undefined,
  fn: (tx: DB, user: Actor) => Promise<T>,
) {
  const user = await actor();
  return withDatabaseContext(
    { userId: user.id, restaurantId: restaurant },
    async () => {
      const db = await getDb();
      try {
        return await db.transaction(async (tx) => {
          const profile = await tx.query<{ status: string }>(
            "SELECT status FROM profiles WHERE id=$1",
            [user.id],
          );
          if (profile.rows[0]?.status !== "active")
            throw new Error("Compte suspendu ou non autorisé.");
          if (restaurant) {
            await requirePlan(tx, restaurant, 39);
            const grants = await tx.query<{ id: string }>(
              "SELECT id FROM support_grants WHERE profile_id=$1 AND restaurant_id=$2 AND expires_at>now() AND revoked_at IS NULL",
              [user.id, restaurant],
            );
            if (grants.rows.length)
              await log(
                tx,
                restaurant,
                user.id,
                "Accès du support au restaurant",
                grants.rows[0].id,
              );
          }
          const result = await fn(tx, user);
          if (restaurant) await registerPresence(tx, restaurant, user);
          return result;
        });
      } catch (error) {
        await recordFailure(error, {
          endpoint: "authenticated",
          restaurant,
          status: failureStatus(error),
        });
        throw error;
      }
    },
  );
}
function failureKind(error: unknown) {
  const m = error instanceof Error ? error.message : "";
  const auth = /Connexion/.test(m),
    forbidden = /refusé|autorisé|suspendu/.test(m),
    limited = /Limite de requêtes/.test(m),
    large = /trop volumineuse/.test(m),
    conflict = /modifié|Quota|quota|déjà|Conflit/.test(m);
  const status = auth
    ? 401
    : forbidden
      ? 403
      : limited
        ? 429
        : large
          ? 413
          : conflict
            ? 409
            : 400;
  return { m, auth, forbidden, limited, large, conflict, status };
}
/** HTTP status that `failure` returns to the client for this error. */
export const failureStatus = (error: unknown) => failureKind(error).status;
/**
 * HTTP status that `/api/v1` returns for this error. Its contract is older
 * and narrower than `failure` (no 409, 413 or 429), and is kept as is.
 */
export function v1FailureStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Connexion")
    ? 401
    : message.includes("refusé") || message.includes("autorisé")
      ? 403
      : 400;
}
export function failure(error: unknown) {
  const { m, auth, forbidden, limited, large, conflict, status } =
    failureKind(error);
  const safe =
    error instanceof Error &&
    error.constructor === Error &&
    !("code" in error) &&
    !/query|constraint|SELECT|INSERT|UPDATE|Cannot |Unexpected |fetch failed|JSON|decrypt|authenticate/i.test(
      m,
    );
  return json(
    {
      error: {
        code: auth
          ? "UNAUTHENTICATED"
          : forbidden
            ? "FORBIDDEN"
            : limited
              ? "RATE_LIMITED"
              : large
                ? "PAYLOAD_TOO_LARGE"
                : conflict
                  ? "CONFLICT"
                  : "INVALID_REQUEST",
        message:
          error instanceof ZodError
            ? "Données invalides."
            : m.includes("Quota d’établissements atteint")
              ? "Quota d’établissements atteint."
              : safe
                ? m.slice(0, 500)
                : "Opération impossible. Vérifiez les données et réessayez.",
      },
    },
    status,
  );
}
export async function rateLimit(tx: DB, key: string, max = 60) {
  const result = await tx.query<{ allowed: boolean }>(
    "SELECT app.consume_rate_limit($1,$2,60) AS allowed",
    [key, max],
  );
  if (!result.rows[0].allowed) throw new Error("Limite de requêtes atteinte.");
}
