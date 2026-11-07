import {
  availability,
  calendar,
  calendarQuery,
  dayQuery,
  requestReservation,
  reservationSchema,
} from "@/features/reservations/service";
import { requirePlan } from "@/features/platform/entitlements";
import { withRequestContext } from "@/features/ops-security/context";
import { logout } from "@/lib/auth/oidc";
import { claimReward } from "@/features/commerce/rewards";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { actor, type Actor } from "@/lib/auth/session";
import { commerce } from "@/features/commerce/service";
import { customerForActor } from "@/features/commerce/account";
import {
  attachCustomerReferral,
  ensureReferralCode,
  joinLoyalty,
  referralInvitation,
} from "@/features/commerce/engagement";
import { publicSite } from "@/features/site/service";
import {
  json,
  failure,
  readBody,
  assertOrigin,
  rateLimit,
} from "@/features/platform/http";
import { createHash } from "node:crypto";
type Context = { params: Promise<{ restaurant: string; action: string }> };
async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant, action } = await c.params;
    const user = ["account", "customer-session"].includes(action)
      ? await actor()
      : undefined;
    return await withDatabaseContext(
      { restaurantId: restaurant, public: true, userId: user?.id },
      async () =>
        json(
          await (
            await getDb()
          ).transaction(async (db) => {
            await requirePlan(db, restaurant, action === "receipt" ? 39 : 69);
            const params = Object.fromEntries(req.nextUrl.searchParams);
            if (action === "calendar")
              return calendar(db, restaurant, calendarQuery.parse(params));
            if (action === "availability")
              return availability(db, restaurant, dayQuery.parse(params));
            const shop = commerce(restaurant);
            if (action === "catalog")
              return {
                ...(await shop.catalog(db)),
                site: await publicSite(db, restaurant),
              };
            if (action === "receipt") {
              const order = await shop.receipt(
                db,
                req.headers.get("x-order-token") || "",
              );
              return {
                ...order,
                token: undefined,
                email_preview: undefined,
                stripe_session: undefined,
                request_hash: undefined,
              };
            }
            if (action === "invite")
              return {
                invitation: await referralInvitation(
                  db,
                  restaurant,
                  params.code || "",
                ),
              };
            if (action === "customer-session" && user) {
              await customerForActor(db, restaurant, user);
              return { id: user.id, name: user.name, email: user.email };
            }
            if (action === "account" && user)
              return shop.customerAccountForCustomer(
                db,
                await customerForActor(db, restaurant, user),
              );
            return { error: "Introuvable." };
          }),
        ),
    );
  } catch (e) {
    return failure(e);
  }
}
async function routePOST(req: NextRequest, c: Context) {
  try {
    await assertOrigin(req);
    const { restaurant, action } = await c.params;
    const body = await readBody(req);
    let user: Actor | undefined;
    try {
      user = await actor();
    } catch {
      /* Guest checkout is allowed. */
    }
    return await withDatabaseContext(
      { restaurantId: restaurant, public: true, userId: user?.id },
      async () =>
        json(
          await (
            await getDb()
          ).transaction(async (db) => {
            const ip = req.headers.get("x-real-ip") || "untrusted";
            const key = createHash("sha256")
              .update(`${restaurant}:${ip}`)
              .digest("hex");
            await rateLimit(db, `store:${key}`, 60);
            const shop = commerce(restaurant);
            if (action === "customer-logout") {
              await logout();
              return { ok: true };
            }
            await requirePlan(db, restaurant, action === "checkout" ? 99 : 69);
            if (action === "reservation") {
              const id = await requestReservation(
                db,
                reservationSchema.parse({ ...body, restaurant }),
              );
              // Bookings made while logged in appear in the account and earn points on arrival.
              if (user)
                await db.query(
                  "UPDATE reservations SET customer_id=$2 WHERE id=$1",
                  [id, await customerForActor(db, restaurant, user)],
                );
              return { id };
            }
            if (action === "checkout") {
              if (body.payment !== "counter")
                throw new Error("Paiement en ligne non raccordé.");
              const customer = user
                ? await customerForActor(db, restaurant, user)
                : undefined;
              if (user) body.email = user.email;
              const order = await shop.checkout(db, body, customer);
              return {
                ...order,
                customer_access_token: undefined,
                email_preview: undefined,
              };
            }
            if (action === "reward") {
              if (!user) throw new Error("Connexion client requise.");
              return claimReward(db, restaurant, user, body);
            }
            if (
              ["loyalty-join", "referral-code", "referral-attach"].includes(
                action,
              )
            ) {
              if (!user) throw new Error("Connexion client requise.");
              const customer = await customerForActor(db, restaurant, user);
              if (action === "loyalty-join") {
                await joinLoyalty(db, customer);
                return { ok: true };
              }
              if (action === "referral-code")
                return {
                  code: await ensureReferralCode(db, restaurant, customer),
                };
              return attachCustomerReferral(
                db,
                restaurant,
                customer,
                user,
                String(body.code || ""),
              );
            }
            if (action === "review") {
              if (!user) throw new Error("Connexion client requise.");
              return shop.submitReview(
                db,
                body,
                await customerForActor(db, restaurant, user),
              );
            }
            throw new Error("Action inconnue.");
          }),
        ),
    );
  } catch (e) {
    return failure(e);
  }
}

export const GET = withRequestContext(
  "/api/store/[restaurant]/[action]",
  routeGET,
);

export const POST = withRequestContext(
  "/api/store/[restaurant]/[action]",
  routePOST,
);
