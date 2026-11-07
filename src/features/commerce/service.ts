import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import { menu } from "@/lib/snapshot";
import {
  createOrder,
  reserve,
  log,
  changeItem,
} from "@/features/orders/service";
import { requirePermission } from "@/lib/permissions";
import type { Actor } from "@/lib/auth/session";
import {
  recordCheckoutPromo,
  redeemCheckoutPromo,
} from "@/features/loyalty/service";
import {
  accountEngagement,
  awardOrderPoints,
  liveFlashRules,
  withFlashPrices,
} from "./engagement";
import { bestFlash } from "./engagement-rules";
import {
  checkoutSchema,
  reviewSubmissionSchema,
  settingsSchema,
  optionSchema,
  type Settings,
  type ShopOrder,
  type Product,
  type CustomerAccount,
  type PublicReview,
} from "./schema";
export function commerce(SHOP: string) {
  const TERMS_VERSION = "2026-10-18";
  async function settings(db: DB) {
    return settingsSchema.parse(
      (
        await one<{ config: Settings }>(
          db,
          "SELECT config FROM shop_settings WHERE restaurant_id=$1",
          [SHOP],
        )
      ).config,
    );
  }
  async function slots(db: DB, now = new Date()) {
    const s = await settings(db);
    if (!s.open) return [];
    const bookings = await rows<{ slot: string; count: number }>(
      db,
      "SELECT o.desired_at::text AS slot,count(*)::int AS count FROM orders o JOIN shop_orders c ON c.order_id=o.id WHERE o.restaurant_id=$1 AND o.status<>'cancelled' AND o.desired_at>=$2 GROUP BY o.desired_at",
      [SHOP, now.toISOString()],
    );
    const used = new Map(
      bookings.map((b) => [new Date(b.slot).getTime(), b.count]),
    );
    const result: string[] = [];
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    for (
      let t =
        Math.ceil((now.getTime() + s.prepMinutes * 60000) / 60000) * 60000;
      t < now.getTime() + 3 * 86400000;
      t += 60000
    ) {
      const p = fmt.formatToParts(t);
      const v = (k: string) => p.find((x) => x.type === k)!.value;
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        v("weekday"),
      );
      const hm = `${v("hour")}:${v("minute")}`;
      if ((Number(v("hour")) * 60 + Number(v("minute"))) % s.interval !== 0)
        continue;
      if (
        s.hours.some((h) => h.day === day && hm >= h.open && hm < h.close) &&
        (used.get(t) || 0) < s.capacity
      )
        result.push(new Date(t).toISOString());
    }
    return result;
  }
  async function catalog(db: DB) {
    const config = await settings(db);
    return {
      settings: config,
      // `menu()` selects m.*, which includes the commerce columns of Product.
      products: (
        await withFlashPrices(
          db,
          SHOP,
          (await menu(db, SHOP)) as unknown as Product[],
        )
      )
        .filter((p) => p.enabled)
        .sort(
          (a, b) =>
            config.categories.indexOf(a.category) -
            config.categories.indexOf(b.category),
        ),
      slots: await slots(db),
      reviews: await rows<PublicReview>(
        db,
        `SELECT pr.id,pr.menu_id,m.name AS menu_name,c.name AS customer_name,pr.rating,pr.body,pr.admin_reply,pr.created_at,pr.verified_purchase
       FROM product_reviews pr
       JOIN menu_items m ON m.id=pr.menu_id
       JOIN customers c ON c.id=pr.customer_id
       WHERE pr.restaurant_id=$1 AND pr.status='published'
       ORDER BY pr.created_at DESC LIMIT 60`,
        [SHOP],
      ),
      stripe: false,
    };
  }
  async function submitReview(db: DB, raw: unknown, customerId: string) {
    const review = reviewSubmissionSchema.parse(raw);
    const purchased = await rows(
      db,
      `SELECT oi.id FROM order_items oi
     JOIN shop_orders so ON so.order_id=oi.order_id
     WHERE so.customer_id=$1 AND oi.menu_id=$2 AND oi.status<>'cancelled' LIMIT 1`,
      [customerId, review.menu],
    );
    const verifiedPurchase = purchased.length > 0;
    const product = await one<{ name: string }>(
      db,
      "SELECT name FROM menu_items WHERE id=$1 AND restaurant_id=$2 AND archived_at IS NULL",
      [review.menu, SHOP],
    );
    const existing = await rows<{ id: string }>(
      db,
      "SELECT id FROM product_reviews WHERE customer_id=$1 AND menu_id=$2",
      [customerId, review.menu],
    );
    const id = existing[0]?.id ?? randomUUID();
    if (existing.length)
      await db.query(
        "UPDATE product_reviews SET rating=$3,body=$4,verified_purchase=$5,status='pending',admin_reply='',moderated_by=NULL,moderated_at=NULL,updated_at=now() WHERE id=$1 AND customer_id=$2",
        [id, customerId, review.rating, review.body, verifiedPurchase],
      );
    else
      await db.query(
        "INSERT INTO product_reviews(id,restaurant_id,menu_id,customer_id,rating,body,verified_purchase) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          SHOP,
          review.menu,
          customerId,
          review.rating,
          review.body,
          verifiedPurchase,
        ],
      );
    await db.query(
      "INSERT INTO notifications(id,restaurant_id,message) VALUES($1,$2,$3)",
      [randomUUID(), SHOP, `Nouvel avis à modérer · ${product.name}`],
    );
    return { id, status: "pending", verifiedPurchase };
  }
  async function receipt(db: DB, token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new Error("Lien de suivi invalide.");
    const o = await one<ShopOrder>(
      db,
      "SELECT c.*,o.status,o.desired_at,o.created_at,o.customer_name,(c.loyalty_points+coalesce(pr.points_awarded,0))::int AS points_awarded FROM shop_orders c JOIN orders o ON o.id=c.order_id LEFT JOIN promo_redemptions pr ON pr.order_id=o.id WHERE c.token=$1 AND o.restaurant_id=$2",
      [token, SHOP],
    );
    o.items = await rows(
      db,
      "SELECT id,menu_id,name,price,quantity,note,status,station FROM order_items WHERE order_id=$1",
      [o.order_id],
    );
    return o;
  }
  async function customerAccount(
    db: DB,
    token: string,
  ): Promise<CustomerAccount> {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new Error("Clé de compte invalide.");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const access = await one<{ id: string; customer_id: string }>(
      db,
      "SELECT id,customer_id FROM customer_access_tokens WHERE token_hash=$1",
      [tokenHash],
    );
    await db.query(
      "UPDATE customer_access_tokens SET last_used_at=now() WHERE id=$1",
      [access.id],
    );
    return customerAccountForCustomer(db, access.customer_id);
  }
  async function customerAccountForCustomer(
    db: DB,
    customerId: string,
  ): Promise<CustomerAccount> {
    const customer = await one<{
      name: string;
      contact: string;
      points: number;
      consent: boolean;
    }>(
      db,
      "SELECT name,contact,coalesce(app.customer_points(id),points) AS points,consent FROM customers WHERE id=$1 AND restaurant_id=$2",
      [customerId, SHOP],
    );
    const orderTokens = await rows<{ token: string }>(
      db,
      "SELECT token FROM shop_orders WHERE customer_id=$1 ORDER BY number DESC LIMIT 100",
      [customerId],
    );
    const rewards = await rows<CustomerAccount["rewards"][number]>(
      db,
      "SELECT id,name,points_cost,kind,value FROM loyalty_rewards WHERE restaurant_id=$1 AND active=true ORDER BY points_cost,name",
      [SHOP],
    );
    return {
      customer: {
        name: customer.name,
        email: customer.contact,
        points: customer.points,
        loyaltyConsent: customer.consent,
      },
      rewards,
      orders: await Promise.all(
        orderTokens.map((order) => receipt(db, order.token)),
      ),
      engagement: await accountEngagement(
        db,
        SHOP,
        customerId,
        customer.points,
        customer.consent,
        rewards,
      ),
    };
  }
  async function checkout(
    db: DB,
    raw: unknown,
    authenticatedCustomerId?: string,
  ) {
    const a = checkoutSchema.parse(raw),
      hash = createHash("sha256").update(JSON.stringify(a)).digest("hex");
    if (a.payment !== "counter")
      throw new Error("Paiement externe non raccordé.");
    await db.query(
      "SELECT restaurant_id FROM shop_settings WHERE restaurant_id=$1 FOR UPDATE",
      [SHOP],
    );
    const prior = await rows<{ token: string; request_hash: string }>(
      db,
      "SELECT c.token,c.request_hash FROM shop_orders c JOIN orders o ON o.id=c.order_id WHERE o.idempotency_key=$1 AND o.restaurant_id=$2",
      [a.key, SHOP],
    );
    if (prior.length) {
      if (prior[0].request_hash !== hash)
        throw new Error(
          "Cette validation a déjà été utilisée pour un autre panier.",
        );
      return receipt(db, prior[0].token);
    }
    if (
      (
        await rows(
          db,
          "SELECT id FROM orders WHERE idempotency_key=$1 AND restaurant_id=$2",
          [a.key, SHOP],
        )
      ).length
    )
      throw new Error("Cette validation appartient déjà à une autre commande.");
    if (!(await slots(db)).includes(a.slot))
      throw new Error(
        "Ce créneau est fermé, complet ou dépassé. Choisissez un autre horaire.",
      );
    const products = (await menu(db, SHOP)) as unknown as Product[];
    // Flash prices are recomputed here: the client price is never trusted.
    const flashRules = await liveFlashRules(db, SHOP);
    let flashItems = 0,
      flashBonus = 0;
    const lines = a.items.map((i) => {
      const p = products.find((p) => p.id === i.menu && p.enabled);
      if (!p) throw new Error("Un produit est indisponible.");
      const flash = bestFlash(flashRules, p.id, p.price);
      if (flash) {
        flashItems += i.quantity;
        flashBonus += flash.rule.member_bonus_points * i.quantity;
      }
      let price = flash ? flash.price : p.price;
      const labels: string[] = [];
      const valid = new Set<string>();
      for (const group of p.options) {
        const selected = group.choices.filter((c) =>
          i.choices.includes(`${group.id}:${c.id}`),
        );
        if (
          (group.required && !selected.length) ||
          (!group.multiple && selected.length > 1)
        )
          throw new Error(`Choisissez ${group.label}.`);
        for (const c of selected) {
          valid.add(`${group.id}:${c.id}`);
          price += c.price;
          labels.push(`${group.label} : ${c.label}`);
        }
      }
      if (valid.size !== i.choices.length)
        throw new Error("Personnalisation invalide.");
      return {
        ...i,
        price,
        note: [...labels, i.note].filter(Boolean).join(" · "),
      };
    });
    const subtotal = lines.reduce((s, i) => s + i.price * i.quantity, 0);
    if (subtotal <= 0 || subtotal > 200000)
      throw new Error("Montant de commande invalide.");
    if (a.promo && !authenticatedCustomerId)
      throw new Error("Connexion client requise pour utiliser un code.");
    const knownCustomer = authenticatedCustomerId
      ? await rows<{ id: string }>(
          db,
          "SELECT id FROM customers WHERE id=$1 AND restaurant_id=$2 AND lower(contact)=lower($3)",
          [authenticatedCustomerId, SHOP, a.email],
        )
      : [];
    if (authenticatedCustomerId && !knownCustomer.length)
      throw new Error("Le compte connecté ne correspond pas à cet e-mail.");
    const customerId = knownCustomer[0]?.id ?? randomUUID();
    let customerAccessToken: string | undefined;
    if (knownCustomer.length) {
      if (a.accountToken) {
        const tokenHash = createHash("sha256")
          .update(a.accountToken)
          .digest("hex");
        const access = await rows(
          db,
          "SELECT id FROM customer_access_tokens WHERE customer_id=$1 AND token_hash=$2",
          [customerId, tokenHash],
        );
        if (!access.length)
          throw new Error(
            "La clé de compte enregistrée ne correspond pas à cet e-mail.",
          );
      }
      await db.query(
        "UPDATE customers SET name=$2,consent=consent OR $3 WHERE id=$1",
        [customerId, a.customer, a.loyaltyConsent],
      );
    } else {
      await db.query(
        "INSERT INTO customers(id,restaurant_id,name,contact,consent,points) VALUES($1,$2,$3,$4,$5,0)",
        [customerId, SHOP, a.customer, a.email, a.loyaltyConsent],
      );
      customerAccessToken = randomBytes(32).toString("hex");
      await db.query(
        "INSERT INTO customer_access_tokens(id,customer_id,token_hash) VALUES($1,$2,$3)",
        [
          randomUUID(),
          customerId,
          createHash("sha256").update(customerAccessToken).digest("hex"),
        ],
      );
    }
    const promo = a.promo
      ? await redeemCheckoutPromo(
          db,
          SHOP,
          a.promo,
          customerId,
          subtotal,
          lines.map((line) => line.menu),
          a.loyaltyConsent,
        )
      : null;
    const total = subtotal - (promo?.discount ?? 0);
    const id = await createOrder(
      db,
      {
        restaurant: SHOP,
        channel: "takeaway",
        customer: a.customer,
        contact: a.email,
        desiredAt: a.slot,
        key: a.key,
        items: lines,
      },
      null,
    );
    const items = await rows<{ id: string; menu_id: string; quantity: number }>(
      db,
      "SELECT id,menu_id,quantity FROM order_items WHERE order_id=$1 ORDER BY ctid",
      [id],
    );
    for (let n = 0; n < items.length; n++) {
      await db.query("UPDATE order_items SET price=$2 WHERE id=$1", [
        items[n].id,
        lines[n].price,
      ]);
      await reserve(
        db,
        SHOP,
        items[n].id,
        items[n].menu_id,
        items[n].quantity,
        null,
        a.items[n].choices,
      );
    }
    await db.query("UPDATE orders SET status='active' WHERE id=$1", [id]);
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO shop_orders(order_id,token,request_hash,consumption,payment_method,total,subtotal,discount,promo_id,customer_id,reorder_items,terms_version,terms_accepted_at,flash_items,flash_bonus_points) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13,$14)",
      [
        id,
        token,
        hash,
        a.consumption,
        a.payment,
        total,
        subtotal,
        promo?.discount ?? 0,
        promo?.id ?? null,
        customerId,
        JSON.stringify(a.items),
        TERMS_VERSION,
        flashItems,
        // The member bonus is reserved to logged-in customers.
        authenticatedCustomerId ? flashBonus : 0,
      ],
    );
    if (promo) await recordCheckoutPromo(db, promo, id, customerId);
    const order = await receipt(db, token),
      s = await settings(db);
    const preview = `DÉMONSTRATION — e-mail non envoyé\natacuisine · Commande #${order.number}\n${a.customer}\n${order.items.map((i) => `${i.quantity} × ${i.name} — ${((i.price * i.quantity) / 100).toFixed(2)} €\n${i.note}`).join("\n")}\n${promo?.discount ? `Remise : -${(promo.discount / 100).toFixed(2)} €\n` : ""}${promo?.points ? `${promo.points} points fidélité ajoutés\n` : ""}Total : ${(total / 100).toFixed(2)} €\n${a.consumption === "onsite" ? "Sur place · aucune table garantie" : "À emporter"}\nPaiement : ${a.payment === "counter" ? "À encaisser au comptoir" : "Stripe test, en attente de confirmation"}\nRetrait : ${new Date(a.slot).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}\n${s.address} · ${s.phone}`;
    await db.query(
      "UPDATE shop_orders SET email_preview=$2 WHERE order_id=$1",
      [id, preview],
    );
    await log(
      db,
      SHOP,
      null,
      "Commande e-commerce confirmée · stock réservé",
      id,
    );
    return {
      ...(await receipt(db, token)),
      customer_access_token: customerAccessToken,
    };
  }
  async function staffOrders(db: DB, user: Actor) {
    requirePermission(user.roles ?? user.role, "orders");
    const list = await rows<{ token: string }>(
      db,
      "SELECT c.token FROM shop_orders c JOIN orders o ON o.id=c.order_id WHERE o.restaurant_id=$1 ORDER BY number DESC LIMIT 150",
      [SHOP],
    );
    return Promise.all(list.map((o) => receipt(db, o.token)));
  }
  async function settle(
    db: DB,
    id: string,
    method: "card" | "cash",
    user: Actor,
  ) {
    requirePermission(user.roles ?? user.role, "payments");
    const o = await one<{
      payment_status: string;
      payment_method: string;
      total: number;
      status: string;
    }>(
      db,
      "SELECT c.*,o.status FROM shop_orders c JOIN orders o ON o.id=c.order_id WHERE c.order_id=$1 AND o.restaurant_id=$2 FOR UPDATE",
      [id, SHOP],
    );
    if (o.payment_method !== "counter")
      throw new Error("Un paiement Stripe doit être confirmé par Stripe.");
    if (o.status === "cancelled") throw new Error("Commande annulée.");
    if (o.payment_status === "paid") return;
    await db.query(
      "INSERT INTO payment_declarations(id,order_id,amount,method,actor) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), id, o.total, method, user.id],
    );
    await db.query(
      "UPDATE shop_orders SET payment_status='paid' WHERE order_id=$1",
      [id],
    );
    await log(db, SHOP, user.id, "Encaissement comptoir déclaré (démo)", id);
    await awardOrderPoints(db, SHOP, id);
  }
  async function transition(db: DB, id: string, target: string, user: Actor) {
    requirePermission(user.roles ?? user.role, "orders");
    const o = await one<{
      token: string;
      payment_status: string;
      payment_method: string;
      status: string;
    }>(
      db,
      "SELECT c.*,o.status FROM shop_orders c JOIN orders o ON o.id=c.order_id WHERE c.order_id=$1 AND o.restaurant_id=$2 FOR UPDATE",
      [id, SHOP],
    );
    if (o.status === "cancelled") {
      if (target === "cancelled") return;
      throw new Error("Commande annulée.");
    }
    if (
      target === "cancelled" &&
      (o.payment_status === "paid" || o.payment_method === "stripe")
    )
      throw new Error(
        "Annulation bloquée : un paiement confirmé ou Stripe nécessite un traitement de remboursement.",
      );
    const order = await receipt(db, o.token);
    for (const item of order.items) {
      if (item.status === "cancelled") continue;
      await changeItem(db, SHOP, item.id, target, user);
    }
    if (target === "cancelled")
      await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [id]);
    if (target === "served") await awardOrderPoints(db, SHOP, id);
  }
  const image = z
    .string()
    .max(500)
    .refine(
      (s) => /^\/(?!\/)[\w/.-]+$/.test(s) || /^https:\/\//.test(s),
      "Utilisez une image locale ou une URL HTTPS.",
    );
  const productDetailsSchema = z
    .object({
      id: z.string(),
      category: z.string().min(1),
      images: z.array(image).max(6),
      allergens: z.string().max(500),
      options: z.array(optionSchema).max(8),
    })
    .superRefine((p, c) => {
      if (
        new Set(p.options.map((o) => o.id)).size !== p.options.length ||
        p.options.some(
          (o) => new Set(o.choices.map((x) => x.id)).size !== o.choices.length,
        )
      )
        c.addIssue({
          code: "custom",
          message: "Identifiants d’options en double.",
        });
    });
  async function updateDetails(db: DB, user: Actor, raw: unknown) {
    requirePermission(user.roles ?? user.role, "catalog");
    const a = productDetailsSchema.parse(raw);
    if (!(await settings(db)).categories.includes(a.category))
      throw new Error("Catégorie inconnue.");
    await one(
      db,
      "SELECT id FROM menu_items WHERE id=$1 AND restaurant_id=$2",
      [a.id, SHOP],
    );
    await db.query(
      "UPDATE menu_items SET category=$2,images=$3,allergens=$4,options=$5 WHERE id=$1",
      [
        a.id,
        a.category,
        JSON.stringify(a.images),
        a.allergens,
        JSON.stringify(a.options),
      ],
    );
    await log(db, SHOP, user.id, "Personnalisations produit modifiées", a.id);
  }
  async function updateSettings(db: DB, user: Actor, raw: unknown) {
    requirePermission(user.roles ?? user.role, "catalog");
    const a = settingsSchema.parse(raw);
    const active = await rows<{ category: string }>(
      db,
      "SELECT DISTINCT category FROM menu_items WHERE restaurant_id=$1 AND archived_at IS NULL",
      [SHOP],
    );
    if (active.some((p) => !a.categories.includes(p.category)))
      throw new Error(
        "Déplacez ou archivez les produits avant de retirer leur catégorie.",
      );
    await db.query(
      "UPDATE shop_settings SET config=$2 WHERE restaurant_id=$1",
      [SHOP, JSON.stringify(a)],
    );
    await log(db, SHOP, user.id, "Paramètres boutique modifiés");
  }

  return {
    settings,
    slots,
    catalog,
    submitReview,
    receipt,
    customerAccount,
    customerAccountForCustomer,
    checkout,
    staffOrders,
    settle,
    transition,
    updateDetails,
    updateSettings,
  };
}
