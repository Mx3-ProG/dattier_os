import { NextRequest, NextResponse } from "next/server";
import { getDb, productionEnabled } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { actor } from "@/infrastructure/auth/session";
import { isQrKind, scanDestination } from "@/features/qr/service";

export const dynamic = "force-dynamic";

/** Traced QR link: records the scan, then sends the visitor to the right place. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // Team pages live on the platform host; locally, stay on the host that
  // carries the session cookie (localhost vs 127.0.0.1).
  const appOrigin =
    productionEnabled() && process.env.APP_URL
      ? process.env.APP_URL
      : `${req.nextUrl.protocol}//${req.headers.get("host") || req.nextUrl.host}`;
  const notFound = () =>
    NextResponse.redirect(new URL("/?qr=inconnu", appOrigin), 303);
  if (!/^[a-z0-9]{10}$/.test(token)) return notFound();
  let userId: string | undefined;
  try {
    userId = (await actor()).id;
  } catch {
    /* Customers scan without being logged in. */
  }
  try {
    const db = await getDb();
    const { rows } = await db.query<{
      restaurant_id: string;
      kind: string;
      ref: string;
      target: string | null;
      archived: boolean;
      staff: boolean;
    }>("SELECT * FROM app.scan_qr($1,$2)", [token, userId ?? null]);
    const q = rows[0];
    if (!q || !isQrKind(q.kind)) return notFound();
    const r = q.restaurant_id;
    // A code whose object disappeared (removed table, archived dish) leads to the site.
    const destination = q.archived
      ? `/r/${encodeURIComponent(r)}`
      : await withDatabaseContext(
          { restaurantId: r, public: true, userId },
          async () =>
            (await getDb()).transaction((tx) =>
              scanDestination(
                tx,
                { kind: q.kind as never, ref: q.ref, target: q.target, restaurant: r },
                q.staff,
                token,
              ),
            ),
        );
    const response = NextResponse.redirect(
      /^https:\/\//.test(destination)
        ? destination
        : new URL(destination, appOrigin),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return notFound();
  }
}
