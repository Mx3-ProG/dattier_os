import { requirePlan } from "@/features/platform/entitlements";
import { recordFailure } from "@/features/ops-security/http";
import {
  withRequestContext,
  requestContext,
} from "@/features/ops-security/context";
import { withDatabaseContext } from "@/lib/database/context";
import { assertOrigin, readBody } from "@/features/platform/http";
import { NextRequest, NextResponse } from "next/server";
import {
  getDb,
  demoEnabled,
  productionEnabled,
  rows,
  one,
} from "@/lib/database/db";
import { actor, login, scope } from "@/lib/auth/session";
import { snapshot, menu } from "@/lib/snapshot";
import {
  actionSchema,
  perform,
  requestReservation,
  reservationSchema,
} from "@/lib/actions";
import { createOrder, orderSchema } from "@/features/orders/service";
import {
  availability,
  calendar,
  calendarQuery,
  dayQuery,
} from "@/features/reservations/service";
import { seed } from "@/lib/database/seed";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Le tenant par défaut n'existe qu'en démonstration ; ailleurs il doit être demandé. */
function tenant(value: unknown) {
  if (typeof value === "string" && value) return value;
  if (demoEnabled()) return "bernay";
  throw new Error("Établissement requis.");
}
async function fail(e: unknown) {
  await recordFailure(e, {
    endpoint: requestContext()?.route || "/api/v1",
    status: 400,
  });
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
async function handleGet(req: NextRequest) {
  try {
    if (!demoEnabled() && !productionEnabled())
      return NextResponse.json(
        { error: "Installation locale uniquement." },
        { status: 503 },
      );
    const endpoint = req.nextUrl.pathname.split("/").at(-1),
      db = await getDb();
    if (endpoint === "profiles" && demoEnabled())
      return NextResponse.json(
        await rows(
          db,
          "SELECT p.* FROM profiles p WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.profile_id=p.id) ORDER BY p.id",
        ),
      );
    if (endpoint === "reward") {
      const token = req.nextUrl.searchParams.get("token") || "";
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Lien invalide.");
      return NextResponse.json(
        await one(
          db,
          "SELECT c.name,p.code,p.kind,p.value,p.expires_on,p.status,p.expires_on<CURRENT_DATE AS expired,r.name AS restaurant FROM promo_codes p JOIN customers c ON c.id=p.customer_id JOIN restaurants r ON r.id=p.restaurant_id WHERE p.token=$1 AND app.reward_plan_allowed(p.token)",
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
    if (endpoint === "calendar" || endpoint === "availability") {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const r = tenant(params.restaurant);
      await requirePlan(db, r, 39);
      return NextResponse.json(
        endpoint === "calendar"
          ? await calendar(db, r, calendarQuery.parse(params))
          : await availability(db, r, dayQuery.parse(params)),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (endpoint === "public") {
      const r = tenant(req.nextUrl.searchParams.get("restaurant"));
      await requirePlan(db, r, 69);
      return NextResponse.json({
        restaurants: await rows(
          db,
          "SELECT id,name,address,phone FROM restaurants WHERE id=$1 ORDER BY id",
          [r],
        ),
        menu: await menu(db, r),
      });
    }
    const user = await actor();
    const r = tenant(req.nextUrl.searchParams.get("restaurant"));
    return NextResponse.json(
      await db.transaction((tx) => snapshot(tx, user, r)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
async function handlePost(req: NextRequest) {
  try {
    if (!demoEnabled() && !productionEnabled())
      return NextResponse.json(
        { error: "Mode démonstration désactivé." },
        { status: 503 },
      );
    await assertOrigin(req);
    if (Number(req.headers.get("content-length") || 0) > 50000)
      throw new Error("Requête trop volumineuse.");
    const endpoint = req.nextUrl.pathname.split("/").at(-1),
      body = await readBody(req),
      db = await getDb();
    if (endpoint === "login") {
      if (typeof body.id !== "string") throw new Error("Profil invalide.");
      return NextResponse.json(await login(body.id));
    }
    if (endpoint === "reservation")
      return NextResponse.json({
        id: await db.transaction(async (tx) => {
          const reservation = reservationSchema.parse(body);
          await requirePlan(tx, reservation.restaurant, 39);
          return requestReservation(tx, reservation);
        }),
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
      if (!demoEnabled()) throw new Error("Réinitialisation non autorisée.");
      if (
        !["OWNER", "SUPER_ADMIN"].includes(user.role) ||
        body.confirm !== "RESET DEMO"
      )
        throw new Error("Confirmation de réinitialisation requise.");
      await db.transaction(async (tx) => {
        await tx.exec("TRUNCATE restaurants,profiles CASCADE");
        await seed(tx);
      });
      return NextResponse.json({ ok: true });
    }
    const restaurant = tenant(body.restaurant);
    const data = actionSchema.parse(body);
    const result = await db.transaction(async (tx) =>
      perform(tx, restaurant, await scope(tx, user, restaurant), data),
    );
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return fail(e);
  }
}

async function routeGET(req: NextRequest) {
  try {
    const endpoint = req.nextUrl.pathname.split("/").at(-1);
    const publicEndpoint = [
      "public",
      "calendar",
      "availability",
      "reward",
    ].includes(endpoint || "");
    const user =
      publicEndpoint || (endpoint === "profiles" && demoEnabled())
        ? undefined
        : await actor();
    return await withDatabaseContext(
      {
        userId: user?.id,
        restaurantId:
          req.nextUrl.searchParams.get("restaurant") ||
          (demoEnabled() ? "bernay" : undefined),
        public: publicEndpoint,
      },
      () => handleGet(req),
    );
  } catch (e) {
    return fail(e);
  }
}
async function routePOST(req: NextRequest) {
  try {
    const endpoint = req.nextUrl.pathname.split("/").at(-1);
    const body = await readBody(req.clone());
    const publicEndpoint = ["reservation", "public-order"].includes(
      endpoint || "",
    );
    const user =
      publicEndpoint || endpoint === "login" ? undefined : await actor();
    return await withDatabaseContext(
      {
        userId: user?.id,
        restaurantId:
          typeof body.restaurant === "string"
            ? body.restaurant
            : demoEnabled()
              ? "bernay"
              : undefined,
        public: publicEndpoint,
      },
      () => handlePost(req),
    );
  } catch (e) {
    return fail(e);
  }
}

export const GET = withRequestContext("/api/v1/[...path]", routeGET);

export const POST = withRequestContext("/api/v1/[...path]", routePOST);
