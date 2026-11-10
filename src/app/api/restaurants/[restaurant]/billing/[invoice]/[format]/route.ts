import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import { authenticated, failure } from "@/features/platform/http";
import { documentData } from "@/features/billing/service";
import { invoicePdf, invoiceXml } from "@/features/billing/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ restaurant: string; invoice: string; format: string }>;
};

async function routeGET(_req: NextRequest, c: Context) {
  try {
    const { restaurant, invoice, format } = await c.params;
    if (format !== "pdf" && format !== "xml")
      throw new Error("Format inconnu.");
    const data = await authenticated(restaurant, (db, user) =>
      documentData(db, restaurant, user, invoice),
    );
    const body =
      format === "pdf" ? await invoicePdf(data) : Buffer.from(invoiceXml(data));
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/xml",
        "Content-Disposition": `attachment; filename="${data.number}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/restaurants/[restaurant]/billing/[invoice]/[format]",
  routeGET,
);
