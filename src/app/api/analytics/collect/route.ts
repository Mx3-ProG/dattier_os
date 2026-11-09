import { NextRequest, NextResponse } from "next/server";
import { collect } from "@/features/analytics/ingest";
import { readBody } from "@/features/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const done = () =>
  new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
/**
 * Collecteur mutualisé des add-ons de mesure. Réponse toujours identique : ne dit à personne
 * si un établissement existe, si l’add-on y est actif ou si la visite a été comptée.
 */
export async function POST(req: NextRequest) {
  try {
    await collect(await readBody(req, 2000));
  } catch {
    /* La mesure d’audience ne doit jamais perturber la navigation. */
  }
  return done();
}
