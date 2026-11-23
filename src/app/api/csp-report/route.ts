import { NextRequest, NextResponse } from "next/server";
import { readBody } from "@/features/platform/http";
import { parseCspReport } from "@/lib/security/csp";

/** Route anonyme : les rapports ne vont qu'aux journaux, avec un plafond par processus. */
const MAX_PER_MINUTE = 60;
let windowStart = 0;
let logged = 0;

export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  try {
    const report = parseCspReport(await readBody(req, 16000));
    if (!report) return done;
    const now = Date.now();
    if (now - windowStart > 60000) {
      windowStart = now;
      logged = 0;
    }
    if (++logged <= MAX_PER_MINUTE)
      console.warn("[csp]", JSON.stringify(report));
  } catch {
    // Corps illisible ou trop long : rien à journaliser.
  }
  return done;
}
