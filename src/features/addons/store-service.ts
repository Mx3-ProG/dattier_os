import { saasAutomaticTax } from "@/features/billing/stripe-saas";
import { addonStripe } from "./billing-config";
import {
  loadingSettingsSchema,
  resolveLoadingConfig,
  type LoadingScreenConfig,
  type LoadingScreenRow,
} from "./loading-screens";
import { purchaseCheckoutReady, reconcilePurchase } from "./purchases";
import type { StoreState } from "./store-catalog";
import { log } from "@/features/orders/service";
import { authenticated as authenticatedRequest } from "@/features/platform/http";
import { scope } from "@/lib/auth/session";
import { demoEnabled, one, rows, type DB } from "@/lib/database/db";
import { can } from "@/lib/permissions";

/**
 * Les refus levés par nos fonctions SQL (RAISE EXCEPTION, code P0001) sont des
 * messages métier : ils restent lisibles, contrairement aux autres erreurs SQL.
 */
export async function withBusinessErrors<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if ((error as { code?: unknown }).code === "P0001") throw new Error((error as Error).message);
    throw error;
  }
}
const authenticated: typeof authenticatedRequest = (restaurant, fn) =>
  withBusinessErrors(() => authenticatedRequest(restaurant, fn));

const orgAdmin = async (db: DB, restaurant: string) =>
  (
    await one<{ admin: boolean }>(
      db,
    "SELECT app.addon_store_manager($1) AS admin",
      [restaurant],
    )
  ).admin;

async function restaurantLogo(db: DB, restaurant: string) {
  const row = await rows<{ logo: string | null }>(
    db,
    `SELECT coalesce(
        (SELECT nullif(config->>'logo','') FROM shop_settings WHERE restaurant_id=$1),
        (SELECT nullif(draft#>>'{branding,logo,src}','/cms/restaurant.svg') FROM restaurant_cms WHERE restaurant_id=$1)
      ) AS logo`,
    [restaurant],
  );
  return row[0]?.logo ?? null;
}

/** Lecture commune à tous les membres : aucun identifiant d’établissement ne vient du client. */
export async function readLoadingScreen(db: DB, restaurant: string): Promise<LoadingScreenConfig | null> {
  const found = await rows<LoadingScreenRow>(
    db,
    `SELECT p.renderer,s.primary_color,s.secondary_color,s.speed::float AS speed,s.show_logo,s.message
       FROM loading_screen_settings s
       JOIN addon_licenses l ON l.restaurant_id=s.restaurant_id AND l.product_id=s.product_id
       JOIN addon_products p ON p.id=s.product_id
      WHERE s.restaurant_id=$1 AND s.enabled AND l.status='active'
        AND app.addon_installed($1,s.product_id)
        AND (l.valid_until IS NULL OR l.valid_until>now())`,
    [restaurant],
  );
  if (!found[0]) return null;
  return resolveLoadingConfig(restaurant, found[0], found[0].show_logo ? await restaurantLogo(db, restaurant) : null);
}
export const loadingScreen = (restaurant: string) =>
  authenticated(restaurant, async (db, user) => {
    await scope(db, user, restaurant);
    return { config: await readLoadingScreen(db, restaurant) };
  });

async function readStore(db: DB, restaurant: string, user: Parameters<typeof scope>[1]): Promise<StoreState> {
  const scoped = await scope(db, user, restaurant);
  const canCustomize = can(scoped.roles ?? scoped.role, "settings");
  if (!canCustomize) throw new Error("Accès refusé pour ce profil.");
  const canBuy = await orgAdmin(db, restaurant);
  const licenses = await rows<StoreState["licenses"][number]>(
    db,
    "SELECT product_id,status,source,valid_until FROM addon_licenses WHERE restaurant_id=$1",
    [restaurant],
  );
  const owned = licenses.filter((license) => license.status !== "revoked").map((license) => license.product_id);
  const settings = await rows<NonNullable<StoreState["settings"]>>(
    db,
    "SELECT product_id,enabled,primary_color,secondary_color,speed::float AS speed,show_logo,message,revision FROM loading_screen_settings WHERE restaurant_id=$1",
    [restaurant],
  );
  return {
    demo: demoEnabled(),
    categories: await rows(
      db,
      "SELECT id,name,description FROM addon_categories WHERE visible ORDER BY position,name",
    ),
    // Un add-on retiré du catalogue reste visible pour les établissements qui le possèdent.
    products: await rows(
      db,
      "SELECT id,category_id,kind,renderer,name,description,pricing_mode,price_cents,currency,sellable,listed,version,compatibility FROM addon_products WHERE listed OR id=ANY($1::text[]) ORDER BY position,name",
      [owned],
    ),
    licenses,
    installations: await rows(db, "SELECT addon_id,installed FROM addon_installations WHERE restaurant_id=$1", [restaurant]),
    pending: canBuy
      ? await rows(db, "SELECT product_id FROM addon_purchases WHERE restaurant_id=$1 AND status='pending'", [restaurant])
      : [],
    settings: settings[0] ?? null,
    analyticsCollecting:
      (
        await rows<{ collecting: boolean }>(
          db,
          "SELECT app.analytics_public_config($1) IS NOT NULL AS collecting",
          [restaurant],
        )
      )[0]?.collecting === true,
    canCustomize,
    canBuy,
    checkoutReady: purchaseCheckoutReady(),
    logo: await restaurantLogo(db, restaurant),
  };
}
export async function addonStore(restaurant: string) {
  const state = await authenticated(restaurant, (db, user) => readStore(db, restaurant, user));
  if (!state.checkoutReady || !state.canBuy || !state.pending.length) return state;
  // Filet de sécurité si un webhook tarde : le retour de Stripe ne donne jamais de droit par lui-même.
  const orders = await authenticated(restaurant, (db) =>
    rows<{ id: string }>(
      db,
      "SELECT id FROM addon_purchases WHERE restaurant_id=$1 AND status='pending' AND stripe_session IS NOT NULL",
      [restaurant],
    ),
  );
  await Promise.allSettled(orders.map((order) => reconcilePurchase(order.id)));
  return authenticated(restaurant, (db, user) => readStore(db, restaurant, user));
}

export async function installFreeAddon(restaurant: string, product: string) {
  return authenticated(restaurant, async (db, user) => {
    await scope(db, user, restaurant);
    await db.query("SELECT app.addon_install_free($1,$2)", [restaurant, product]);
    await db.query("SELECT app.addon_installation_set($1,$2,true)", [restaurant, product]);
    await log(db, restaurant, user.id, "Add-on gratuit installé", product);
    return readStore(db, restaurant, user);
  });
}

export async function setAddonInstallation(restaurant: string, product: string, installed: boolean) {
  return authenticated(restaurant, async (db, user) => {
    await scope(db, user, restaurant);
    await db.query("SELECT app.addon_installation_set($1,$2,$3)", [restaurant, product, installed]);
    await log(db, restaurant, user.id, installed ? "Add-on installé" : "Add-on désinstallé", product);
    return readStore(db, restaurant, user);
  });
}

export async function saveLoadingScreen(restaurant: string, input: unknown) {
  const value = loadingSettingsSchema.parse(input);
  return authenticated(restaurant, async (db, user) => {
    const scoped = await scope(db, user, restaurant);
    if (!can(scoped.roles ?? scoped.role, "settings")) throw new Error("Accès refusé pour ce profil.");
    if (value.enabled && value.productId) {
      const active = await one<{ installed: boolean }>(db,
        "SELECT app.addon_installed($1,$2) AS installed", [restaurant, value.productId]);
      if (!active.installed) throw new Error("Réinstallez cet add-on avant de l’activer.");
    }
    await db.query("SELECT app.loading_screen_save($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      restaurant,
      value.productId,
      value.enabled,
      value.primaryColor,
      value.secondaryColor,
      value.speed,
      value.showLogo,
      value.message,
      value.revision,
    ]);
    await log(db, restaurant, user.id, "Écran de chargement modifié", value.productId ?? "aucun");
    return { state: await readStore(db, restaurant, user), config: await readLoadingScreen(db, restaurant) };
  });
}

type OpenOrder = {
  id: string;
  amount_cents: number;
  currency: string;
  product_name: string;
  stripe_session: string | null;
  stale: boolean;
};
export async function purchaseAddon(restaurant: string, product: string) {
  if (!purchaseCheckoutReady()) throw new Error("Le paiement de cet achat n’est pas encore configuré.");
  const stripe = addonStripe();
  const open = () =>
    authenticated(restaurant, async (db, user) => {
      await scope(db, user, restaurant);
      return one<OpenOrder>(db, "SELECT * FROM app.addon_purchase_open($1,$2)", [restaurant, product]);
    });
  let order = await open();
  if (order.stripe_session) {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session);
    if (session.status === "open" && !order.stale && session.url) return { url: session.url };
    // Fermer l’ancienne page de paiement évite qu’un onglet resté ouvert débite une seconde fois.
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    await reconcilePurchase(order.id);
    order = await open();
  }
  const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3000").origin;
  const returnUrl = `${origin}/dashboard?restaurant=${encodeURIComponent(restaurant)}&module=addons`;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency,
            unit_amount: order.amount_cents,
            tax_behavior: "inclusive",
            product_data: { name: order.product_name, metadata: { addon_product: product } },
          },
        },
      ],
      ...(saasAutomaticTax() ? { automatic_tax: { enabled: true } } : {}),
      success_url: returnUrl,
      cancel_url: returnUrl,
      metadata: { addon_purchase: order.id },
      payment_intent_data: { metadata: { addon_purchase: order.id } },
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    },
    { idempotencyKey: `addon-purchase:${order.id}:${order.amount_cents}` },
  );
  await authenticated(restaurant, async (db, user) => {
    await db.query("SELECT app.addon_purchase_attach($1,$2)", [order.id, session.id]);
    await log(db, restaurant, user.id, "Paiement d’add-on ouvert", product);
  });
  if (!session.url) throw new Error("Page de paiement indisponible.");
  return { url: session.url };
}
