import { NextRequest } from "next/server";
import { actor } from "@/infrastructure/auth/session";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { getDb } from "@/infrastructure/database/db";
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
  invoiceAction,
  invoiceActionSchema,
  invoicesState,
  maxDocumentBytes,
  uploadInvoice,
  type Run,
} from "@/features/invoices/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Context = { params: Promise<{ restaurant: string }> };

async function routeGET(_req: NextRequest, c: Context) {
  try {
    const { restaurant } = await c.params;
    return json(
      await authenticated(restaurant, (db, user) =>
        invoicesState(db, restaurant, user),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

async function readDocument(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > maxDocumentBytes)
    throw new Error("Requête trop volumineuse.");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Document absent.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxDocumentBytes) {
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
    // Dépôt : octets bruts, avec le nom du fichier en en-tête.
    if (req.headers.get("content-type") !== "application/json") {
      const data = await readDocument(req);
      const user = await actor();
      const db = await getDb();
      const run: Run = (fn) =>
        withDatabaseContext({ userId: user.id, restaurantId: restaurant }, () =>
          db.transaction(fn),
        );
      await run((tx) => rateLimit(tx, `invoices:${user.id}`, 30));
      const name = decodeURIComponent(req.headers.get("x-filename") || "");
      return json(await uploadInvoice(run, restaurant, user, data, name));
    }
    const action = invoiceActionSchema.parse(await readBody(req));
    return json(
      await authenticated(restaurant, (db, user) =>
        invoiceAction(db, restaurant, user, action),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/invoices",
  routeGET,
);
export const POST = withRequestContext(
  "/api/restaurants/[restaurant]/invoices",
  routePOST,
);
