import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import { authenticated, failure } from "@/features/platform/http";
import { documentFor } from "@/features/invoices/service";
import { loadDocument } from "@/features/invoices/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ restaurant: string; invoice: string }> };

/** Sert le justificatif. Le dépôt n’admet que PDF, images et XML, et le XML est téléchargé. */
async function routeGET(_req: NextRequest, c: Context) {
  try {
    const { restaurant, invoice } = await c.params;
    const doc = await authenticated(restaurant, (db, user) =>
      documentFor(db, restaurant, user, invoice),
    );
    const body = await loadDocument(doc.object_key);
    if (!body) throw new Error("Document introuvable.");
    const inline = doc.content_type !== "application/xml";
    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": doc.content_type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/invoices/[invoice]",
  routeGET,
);
