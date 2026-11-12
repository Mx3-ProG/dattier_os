import { withRequestContext } from "@/features/ops-security/context";
import { NextResponse } from "next/server";
import { getDb } from "@/infrastructure/database/db";
export const dynamic = "force-dynamic";
async function routeGET() {
  try {
    const status = await (
      await getDb()
    ).query<{ ready: boolean }>("SELECT app.health_ready() AS ready");
    if (!status.rows[0]?.ready) throw new Error("Migration requise.");
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}

export const GET = withRequestContext("/api/health", routeGET);
