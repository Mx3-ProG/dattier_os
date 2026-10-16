import { NextRequest, NextResponse } from "next/server";
import { getDb, demoEnabled, rows, one } from "@/lib/database/db";
import { actor, login, scope } from "@/lib/auth/session";
import { snapshot, menu } from "@/lib/snapshot";
import {
  actionSchema,
  perform,
  requestReservation,
  reservationSchema,
} from "@/lib/actions";
import { createOrder, orderSchema } from "@/features/orders/service";
import { seed } from "@/lib/database/seed";
import { hasRole } from "@/lib/permissions";
import { runSweep } from "@/features/notifications/service";
import { listHistory } from "@/features/events/history";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
  const message = e instanceof Error ? e.message : "Opération impossible";
  const safe =
    message.includes("query:") || message.includes("constraint")
      ? "Les données ne permettent pas cette opération."
      : message;
  return NextResponse.json(
    { error: safe },
    {
      status: message.includes("Connexion")
        ? 401
        : message.includes("refusé") || message.includes("autorisé")
          ? 403
          : 400,
    },
  );
}
export async function GET(req: NextRequest) {
  try {
    if (!demoEnabled())
      return NextResponse.json(
        { error: "Installation locale uniquement." },
        { status: 503 },
      );
    const endpoint = req.nextUrl.pathname.split("/").at(-1),
      db = await getDb();
    if (endpoint === "profiles")
      return NextResponse.json(
        await rows(db, "SELECT * FROM profiles ORDER BY id"),
      );
    if (endpoint === "reward") {
      const token = req.nextUrl.searchParams.get("token") || "";
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Lien invalide.");
      return NextResponse.json(
        await one(
          db,
          "SELECT c.name,p.code,p.kind,p.value,p.expires_on,p.status,p.expires_on<CURRENT_DATE AS expired,r.name AS restaurant FROM promo_codes p JOIN customers c ON c.id=p.customer_id JOIN restaurants r ON r.id=p.restaurant_id WHERE p.token=$1",
          [token],
        ),
        {
          headers: {
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    }
    if (endpoint === "public") {
      const r = req.nextUrl.searchParams.get("restaurant") || "bernay";
      return NextResponse.json({
        restaurants: await rows(
          db,
          "SELECT id,name,address,phone FROM restaurants ORDER BY id",
        ),
        menu: await menu(db, r),
      });
    }
    const user = await actor();
    const q = req.nextUrl.searchParams;
    const r = q.get("restaurant") || "bernay";
    if (endpoint === "history")
      return NextResponse.json(
        await db.transaction(async (tx) =>
          listHistory(tx, r, await scope(tx, user, r), {
            category: q.get("category") || undefined,
            before: q.get("before") || undefined,
            days: Number(q.get("days")) || undefined,
            query: q.get("q")?.slice(0, 100) || undefined,
          }),
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    await db.transaction((tx) => scope(tx, user, r));
    await runSweep(db, r);
    return NextResponse.json(
      await db.transaction((tx) => snapshot(tx, user, r)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!demoEnabled())
      return NextResponse.json(
        { error: "Mode démonstration désactivé." },
        { status: 503 },
      );
    if (
      !req.headers.get("origin") ||
      new URL(req.headers.get("origin")!).host !== req.headers.get("host") ||
      !["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(req.headers.get("origin")!).hostname,
      )
    )
      return NextResponse.json(
        { error: "Origine non autorisée." },
        { status: 403 },
      );
    if (Number(req.headers.get("content-length") || 0) > 50000)
      throw new Error("Requête trop volumineuse.");
    const endpoint = req.nextUrl.pathname.split("/").at(-1),
      body = await req.json(),
      db = await getDb();
    if (endpoint === "login") {
      if (typeof body.id !== "string") throw new Error("Profil invalide.");
      return NextResponse.json(await login(body.id));
    }
    if (endpoint === "reservation")
      return NextResponse.json({
        id: await db.transaction((tx) =>
          requestReservation(tx, reservationSchema.parse(body)),
        ),
      });
    if (endpoint === "public-order") {
      const data = orderSchema.parse(body);
      if (data.channel === "staff") throw new Error("Canal non autorisé.");
      return NextResponse.json({
        id: await db.transaction((tx) => createOrder(tx, data, null)),
      });
    }
    const user = await actor();
    if (endpoint === "reset") {
      if (
        !hasRole(user, ["OWNER", "SUPER_ADMIN"]) ||
        body.confirm !== "RESET DEMO"
      )
        throw new Error("Confirmation de réinitialisation requise.");
      await db.transaction(async (tx) => {
        await tx.exec("TRUNCATE restaurants,profiles CASCADE");
        await seed(tx);
      });
      return NextResponse.json({ ok: true });
    }
    const restaurant =
      typeof body.restaurant === "string" ? body.restaurant : "bernay";
    const data = actionSchema.parse(body);
    const result = await db.transaction(async (tx) =>
      perform(tx, restaurant, await scope(tx, user, restaurant), data),
    );
    await runSweep(db, restaurant, 0);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return fail(e);
  }
}
