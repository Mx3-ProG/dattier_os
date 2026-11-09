import {
  availability,
  calendar,
  calendarQuery,
  dayQuery,
  requestReservation,
  reservationSchema,
} from "@/features/reservations/service";
import { requirePlan, requirePaidAddon } from "@/features/platform/entitlements";
import { withRequestContext } from "@/features/ops-security/context";
import { logout } from "@/lib/auth/oidc";
import { claimReward } from "@/features/commerce/rewards";
import { NextRequest } from "next/server";
import { getDb, type DB } from "@/lib/database/db";
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
import { ensureQr, labelFor } from "@/features/qr/service";
import { onlineReady } from "@/features/payments/config";
import { startCheckout } from "@/features/payments/service";
import { rows } from "@/lib/database/db";
type Context = { params: Promise<{ restaurant: string; action: string }> };
async function requireInstalled(db: DB, restaurant: string, addon: string) {
  const state = await db.query<{ installed: boolean }>("SELECT app.addon_installed($1,$2) AS installed", [restaurant, addon]);
  if (!state.rows[0]?.installed) throw new Error("Cet add-on n’est pas installé pour cet établissement.");
}
async function routeGET(req: NextRequest, c: Context) {
  try {
    const { restaurant, action } = await c.params;
    const user = ["account", "customer-session", "qr"].includes(action)
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
            if (["calendar", "availability"].includes(action)) await requireInstalled(db, restaurant, "booking");
            if (action === "catalog") await requireInstalled(db, restaurant, "website");
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
            if (action === "qr") {
              // Customer-side codes: an order (proved by its tracking token),
              // or the logged-in customer's card, referral, booking or gift.
              const kind = params.kind;
              if (kind === "order") {
                const order = await shop.receipt(
                  db,
                  req.headers.get("x-order-token") || "",
                );
                const q = await ensureQr(
                  db,
                  restaurant,
                  "order",
                  order.order_id,
                  await labelFor(db, restaurant, "order", order.order_id),
                );
                return { token: q.token };
              }
              if (!user) throw new Error("Connexion client requise.");
              const customer = await customerForActor(db, restaurant, user);
              if (kind === "customer" || kind === "referral") {
                const q = await ensureQr(
                  db,
                  restaurant,
                  kind,
                  customer,
                  await labelFor(db, restaurant, kind, customer),
                );
                return { token: q.token };
              }
              if (kind === "reservation") {
                const own = await rows(
                  db,
                  "SELECT id FROM reservations WHERE id=$1 AND restaurant_id=$2 AND customer_id=$3",
                  [params.ref || "", restaurant, customer],
                );
                if (!own.length) throw new Error("Réservation introuvable.");
                const q = await ensureQr(
                  db,
                  restaurant,
                  "reservation",
                  params.ref,
                  await labelFor(db, restaurant, "reservation", params.ref),
                );
                return { token: q.token };
              }
              if (kind === "promo") {
                const promo = await rows<{ id: string; code: string; name: string }>(
                  db,
                  "SELECT p.id,p.code,c.name FROM promo_codes p JOIN customers c ON c.id=p.customer_id WHERE p.code=$1 AND p.restaurant_id=$2 AND p.customer_id=$3",
                  [String(params.ref || "").toUpperCase(), restaurant, customer],
                );
                if (!promo.length) throw new Error("Code introuvable.");
                const q = await ensureQr(
                  db,
                  restaurant,
                  "promo",
                  promo[0].id,
                  `${promo[0].code} · ${promo[0].name}`,
                );
                return { token: q.token };
              }
              throw new Error("QR code inconnu.");
            }
            // Lecture seule : visiter un site ne crée aucune fiche chez ce restaurant.
            if (action === "customer-session" && user)
              return { id: user.id, name: user.name, email: user.email };
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
    // Hors transaction : l’appel à Stripe ne doit pas garder une connexion ouverte.
    if (action === "payment")
      return await withDatabaseContext(
        { restaurantId: restaurant, public: true },
        async () => {
          const database = await getDb();
          await database.transaction(async (db) => {
            const ip = req.headers.get("x-real-ip") || "untrusted";
            await rateLimit(
              db,
              `store:${createHash("sha256").update(`${restaurant}:${ip}`).digest("hex")}`,
              60,
            );
            await requirePlan(db, restaurant, 99);
            await requireInstalled(db, restaurant, "online-orders");
          });
          return json(
            await startCheckout(
              (fn) => database.transaction(fn),
              restaurant,
              body,
            ),
          );
        },
      );
    return await withDatabaseContext(
      { restaurantId: restaurant, public: true, userId: user?.id },
      async () => {
        const ip = req.headers.get("x-real-ip") || "untrusted";
        const key = createHash("sha256")
          .update(`${restaurant}:${ip}`)
          .digest("hex");
        // Transaction à part : une requête refusée doit compter, sinon son échec efface le compteur.
        await (
          await getDb()
        ).transaction((db) => rateLimit(db, `store:${key}`, 60));
        return json(
          await (
            await getDb()
          ).transaction(async (db) => {
            const shop = commerce(restaurant);
            if (action === "customer-logout") {
              await logout();
              return { ok: true };
            }
            await requirePlan(db, restaurant, action === "checkout" ? 99 : 69);
            if (action === "reservation") await requireInstalled(db, restaurant, "booking");
            if (action === "checkout") await requireInstalled(db, restaurant, "online-orders");
            if (["reward", "loyalty-join", "referral-code", "referral-attach"].includes(action))
              await requireInstalled(db, restaurant, "loyalty");
            if (action === "reservation") {
              const id = await requestReservation(
                db,
                reservationSchema.parse({ ...body, restaurant }),
              );
              // Bookings made while logged in appear in the account and earn points on arrival.
              // A session without a verified e-mail (team profile) books as a guest.
              if (user?.email)
                await db.query(
                  "UPDATE reservations SET customer_id=$2 WHERE id=$1",
                  [id, await customerForActor(db, restaurant, user)],
                );
              return { id };
            }
            if (action === "checkout") {
              if (
                body.payment !== "counter" &&
                !(await onlineReady(db, restaurant))
              )
                throw new Error("Paiement en ligne indisponible.");
              const customer = user?.email
                ? await customerForActor(db, restaurant, user)
                : undefined;
              if (user?.email) body.email = user.email;
              const order = await shop.checkout(db, body, customer);
              return {
                ...order,
                customer_access_token: undefined,
                email_preview: undefined,
              };
            }
            if (action === "reward") {
              await requirePaidAddon(db,restaurant,"loyalty");
              if (!user) throw new Error("Connexion client requise.");
              return claimReward(db, restaurant, user, body);
            }
            if (
              ["loyalty-join", "referral-code", "referral-attach"].includes(
                action,
              )
            ) {
              await requirePaidAddon(db,restaurant,"loyalty");
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
        );
      },
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
