import { NextRequest } from "next/server";
import { actor } from "@/lib/auth/session";
import { withDatabaseContext } from "@/lib/database/context";
import { getDb } from "@/lib/database/db";
import { withRequestContext } from "@/features/ops-security/context";
import {
  assertOrigin,
  authenticated,
  failure,
  json,
  rateLimit,
  readBody,
} from "@/features/platform/http";
import {
  bankAction,
  bankActionSchema,
  bankState,
  importStatement,
  maxStatementBytes,
  type Run,
} from "@/features/bank/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(_req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(
      await authenticated(restaurant, (db, user) =>
        bankState(db, restaurant, user),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

async function readStatement(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > maxStatementBytes)
    throw new Error("Requête trop volumineuse.");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Relevé absent.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxStatementBytes) {
      await reader.cancel();
      throw new Error("Requête trop volumineuse.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant } = await c.params;
    // Import : octets bruts, avec le compte et le nom du fichier en en-têtes.
    if (req.headers.get("content-type") !== "application/json") {
      const data = await readStatement(req);
      const user = await actor();
      const db = await getDb();
      const run: Run = (fn) =>
        withDatabaseContext({ userId: user.id, restaurantId: restaurant }, () =>
          db.transaction(fn),
        );
      await run((tx) => rateLimit(tx, `bank:${user.id}`, 20));
      return json(
        await importStatement(
          run,
          restaurant,
          user,
          req.headers.get("x-account") || "",
          data,
          decodeURIComponent(req.headers.get("x-filename") || ""),
        ),
      );
    }
    const action = bankActionSchema.parse(await readBody(req));
    return json(
      await authenticated(restaurant, (db, user) =>
        bankAction(db, restaurant, user, action),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/bank",
  routeGET,
);
export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/bank",
  routePOST,
);
