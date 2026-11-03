import { randomUUID, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { rows, one, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log, changeItem } from "@/features/orders/service";
const id = z.string().min(1).max(150);
export const offlineAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolveConflict"),
    operation: id,
    decision: z.enum(["retry", "reject"]),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal("register"),
    name: z.string().trim().min(2).max(80),
  }),
  z.object({
    action: z.literal("allocate"),
    device: id,
    menu: id,
    quantity: z.number().int().min(1).max(200),
  }),
  z.object({
    action: z.literal("sync"),
    device: id,
    events: z
      .array(
        z.object({
          id: z.uuid(),
          kind: z.enum(["order", "preparing", "ready", "served", "cancelled"]),
          order: z.uuid(),
          items: z
            .array(
              z.object({
                quota: id,
                quantity: z.number().int().min(1).max(50),
              }),
            )
            .max(40)
            .optional(),
          table: z.string().max(80).optional(),
          at: z.iso.datetime(),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({ action: z.literal("reconcile"), device: id }),
]);
async function device(db: DB, r: string, user: Actor, id: string) {
  return one<{ id: string }>(
    db,
    "SELECT id FROM offline_devices WHERE id=$1 AND restaurant_id=$2 AND (profile_id=$3 OR $4::boolean) AND revoked_at IS NULL FOR UPDATE",
    [
      id,
      r,
      user.id,
      (user.roles ?? [user.role]).some((role) =>
        ["OWNER", "MANAGER", "SUPER_ADMIN"].includes(role),
      ),
    ],
  );
}
export async function offlineState(db: DB, r: string, user: Actor) {
  await scope(db, user, r);
  return {
    devices: await rows(
      db,
      "SELECT id,name,created_at FROM offline_devices WHERE restaurant_id=$1 AND profile_id=$2 AND revoked_at IS NULL",
      [r, user.id],
    ),
    quotas: await rows(
      db,
      "SELECT q.* FROM offline_quotas q JOIN offline_devices d ON d.id=q.device_id WHERE d.restaurant_id=$1 AND d.profile_id=$2 AND q.status='allocated'",
      [r, user.id],
    ),
    operations: await rows(
      db,
      "SELECT o.id,o.status,o.error FROM offline_operations o JOIN offline_devices d ON d.id=o.device_id WHERE d.restaurant_id=$1 AND d.profile_id=$2 ORDER BY o.created_at DESC LIMIT 1000",
      [r, user.id],
    ),
    conflicts: await rows(
      db,
      "SELECT o.id,o.error,o.payload FROM offline_operations o JOIN offline_devices d ON d.id=o.device_id WHERE d.restaurant_id=$1 AND d.profile_id=$2 AND o.status='conflict' ORDER BY o.created_at DESC LIMIT 100",
      [r, user.id],
    ),
  };
}
export async function offlinePerform(
  db: DB,
  r: string,
  user: Actor,
  raw: unknown,
): Promise<unknown> {
  user = await scope(db, user, r);
  requirePermission(user.roles ?? user.role, "orders");
  const a = offlineAction.parse(raw);
  if (a.action === "resolveConflict") {
    if (
      !(user.roles ?? [user.role]).some((role) =>
        ["OWNER", "MANAGER", "SUPER_ADMIN"].includes(role),
      )
    )
      throw new Error("Résolution non autorisée.");
    const operation = await one<{
      device_id: string;
      payload: unknown;
      status: string;
    }>(
      db,
      "SELECT o.* FROM offline_operations o JOIN offline_devices d ON d.id=o.device_id WHERE o.id=$1 AND d.restaurant_id=$2 FOR UPDATE OF o",
      [a.operation, r],
    );
    if (operation.status !== "conflict")
      throw new Error("Conflit déjà traité.");
    await db.query(
      "INSERT INTO offline_conflict_decisions VALUES($1,$2,$3,$4,$5,$6,now())",
      [randomUUID(), r, a.operation, a.decision, a.reason, user.id],
    );
    await log(
      db,
      r,
      user.id,
      `Conflit hors ligne : ${a.decision}`,
      a.operation,
    );
    if (a.decision === "reject") {
      await db.query(
        "UPDATE offline_operations SET status='resolved',error=$2 WHERE id=$1",
        [a.operation, `Écart à rapprocher manuellement : ${a.reason}`],
      );
      return { resolved: true };
    }
    await db.query(
      "UPDATE offline_operations SET status='retrying' WHERE id=$1",
      [a.operation],
    );
    return offlinePerform(db, r, user, {
      action: "sync",
      device: operation.device_id,
      events: [operation.payload],
    });
  }
  if (a.action === "register") {
    const did = randomUUID();
    await db.query(
      "INSERT INTO offline_devices(id,restaurant_id,profile_id,name) VALUES($1,$2,$3,$4)",
      [did, r, user.id, a.name],
    );
    await log(db, r, user.id, "Poste hors ligne enregistré", did);
    return { id: did };
  }
  await device(db, r, user, a.device);
  if (a.action === "allocate") {
    const p = await one<{ name: string; price: number; station: string }>(
      db,
      "SELECT name,price,station FROM menu_items WHERE id=$1 AND restaurant_id=$2 AND enabled AND archived_at IS NULL FOR UPDATE",
      [a.menu, r],
    );
    const recipe = await rows<{ ingredient_id: string; quantity: number }>(
      db,
      "SELECT ingredient_id,quantity::float FROM recipe_ingredients WHERE menu_id=$1 ORDER BY ingredient_id",
      [a.menu],
    );
    if (!recipe.length) throw new Error("Recette absente.");
    const qid = randomUUID();
    let expires = "9999-12-31";
    await db.query(
      "INSERT INTO offline_quotas(id,device_id,menu_id,quantity,catalog) VALUES($1,$2,$3,$4,$5)",
      [qid, a.device, a.menu, a.quantity, JSON.stringify(p)],
    );
    for (const ingredient of recipe) {
      let needed = ingredient.quantity * a.quantity;
      const lots = await rows<{
        id: string;
        available: number;
        expires_on: string;
      }>(
        db,
        "SELECT id,(quantity-reserved)::float AS available,expires_on::text FROM stock_lots WHERE ingredient_id=$1 AND expires_on>=CURRENT_DATE AND quantity>reserved ORDER BY expires_on,id FOR UPDATE",
        [ingredient.ingredient_id],
      );
      for (const l of lots) {
        const take = Math.min(needed, l.available);
        if (take <= 0) continue;
        await db.query(
          "UPDATE stock_lots SET reserved=reserved+$2 WHERE id=$1",
          [l.id, take],
        );
        await db.query(
          "INSERT INTO offline_allocations(id,quota_id,lot_id,quantity) VALUES($1,$2,$3,$4)",
          [randomUUID(), qid, l.id, take],
        );
        expires = expires < l.expires_on ? expires : l.expires_on;
        needed -= take;
        if (needed < 0.000001) break;
      }
      if (needed > 0.000001)
        throw new Error("Stock insuffisant pour ce quota.");
    }
    await db.query("UPDATE offline_quotas SET catalog=$2 WHERE id=$1", [
      qid,
      JSON.stringify({ ...p, expiresOn: expires }),
    ]);
    await log(db, r, user.id, "Stock réservé au poste hors ligne", qid);
    return { id: qid };
  }
  if (a.action === "reconcile") {
    // Caller must have synced every local event before invoking. Never automatic expiry/reallocation.
    const quotas = await rows<{ id: string }>(
      db,
      "SELECT id FROM offline_quotas WHERE device_id=$1 AND status='allocated' FOR UPDATE",
      [a.device],
    );
    for (const q of quotas) {
      const lots = await rows<{ lot_id: string; remaining: number }>(
        db,
        "SELECT lot_id,(quantity-consumed)::float AS remaining FROM offline_allocations WHERE quota_id=$1 FOR UPDATE",
        [q.id],
      );
      for (const l of lots)
        await db.query(
          "UPDATE stock_lots SET reserved=reserved-$2 WHERE id=$1",
          [l.lot_id, l.remaining],
        );
      await db.query(
        "UPDATE offline_quotas SET status='reconciled' WHERE id=$1",
        [q.id],
      );
    }
    await db.query("UPDATE offline_devices SET revoked_at=now() WHERE id=$1", [
      a.device,
    ]);
    await log(
      db,
      r,
      user.id,
      "Poste réconcilié et retiré ; quotas libérés",
      a.device,
    );
    return { reconciled: true };
  }
  const results = [];
  for (const event of a.events) {
    const hash = createHash("sha256")
      .update(JSON.stringify(event))
      .digest("hex");
    const prior = await rows<{
      payload_hash: string;
      status: string;
      error: string | null;
    }>(
      db,
      "SELECT payload_hash,status,error FROM offline_operations WHERE id=$1 AND device_id=$2",
      [event.id, a.device],
    );
    if (prior.length && prior[0].status !== "retrying") {
      if (prior[0].payload_hash !== hash)
        throw new Error("Identifiant de synchronisation réutilisé.");
      results.push({
        id: event.id,
        status: prior[0].status,
        error: prior[0].error,
      });
      continue;
    }
    await db.exec("SAVEPOINT offline_event");
    try {
      if (new Date(event.at).getTime() > Date.now() + 60000)
        throw new Error("Horodatage futur.");
      if (event.kind === "order") {
        if (!event.items?.length) throw new Error("Commande vide.");
        await db.query(
          "INSERT INTO orders(id,restaurant_id,channel,status,created_by,idempotency_key,customer_name) VALUES($1,$2,'staff','active',$3,$4,$5)",
          [
            event.order,
            r,
            user.id,
            event.id,
            `Hors ligne${event.table ? " · " + event.table : ""}`,
          ],
        );
        let total = 0;
        for (const item of event.items) {
          const q = await one<{
            id: string;
            menu_id: string;
            quantity: number;
            used: number;
            created_at: string;
            catalog: {
              name: string;
              price: number;
              station: string;
              expiresOn: string;
            };
          }>(
            db,
            "SELECT * FROM offline_quotas WHERE id=$1 AND device_id=$2 AND status='allocated' FOR UPDATE",
            [item.quota, a.device],
          );
          if (q.used + item.quantity > q.quantity)
            throw new Error("Quota dépassé.");
          if (new Date(event.at) < new Date(q.created_at))
            throw new Error("Commande antérieure au quota.");
          const day = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Paris",
          }).format(new Date(event.at));
          if (day > q.catalog.expiresOn)
            throw new Error("Quota alimentaire expiré.");
          const iid = randomUUID();
          await db.query(
            "INSERT INTO order_items(id,order_id,menu_id,name,price,quantity,station,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              iid,
              event.order,
              q.menu_id,
              q.catalog.name,
              q.catalog.price,
              item.quantity,
              q.catalog.station,
              "Commande hors ligne",
            ],
          );
          total += q.catalog.price * item.quantity;
          const lots = await rows<{
            id: string;
            lot_id: string;
            quantity: number;
            consumed: number;
          }>(
            db,
            "SELECT id,lot_id,quantity::float,consumed::float FROM offline_allocations WHERE quota_id=$1 ORDER BY id FOR UPDATE",
            [q.id],
          );
          for (const l of lots) {
            const portion = (l.quantity * item.quantity) / q.quantity;
            if (l.consumed + portion > l.quantity + 0.000001)
              throw new Error("Allocation incohérente.");
            await db.query(
              "INSERT INTO stock_reservations(id,item_id,lot_id,quantity) VALUES($1,$2,$3,$4)",
              [randomUUID(), iid, l.lot_id, portion],
            );
            await db.query(
              "UPDATE offline_allocations SET consumed=consumed+$2 WHERE id=$1",
              [l.id, portion],
            );
          }
          await db.query("UPDATE offline_quotas SET used=used+$2 WHERE id=$1", [
            q.id,
            item.quantity,
          ]);
        }
        await db.query(
          "INSERT INTO shop_orders(order_id,token,request_hash,consumption,payment_method,total,subtotal) VALUES($1,$2,$3,'onsite','counter',$4,$4)",
          [event.order, randomBytes(32).toString("hex"), hash, total],
        );
      } else {
        if (event.kind === "cancelled") {
          const payment = await one<{ payment_status: string }>(
            db,
            "SELECT payment_status FROM shop_orders WHERE order_id=$1",
            [event.order],
          );
          if (payment.payment_status === "paid")
            throw new Error("Commande payée : remboursement requis.");
        }
        const order = await one<{ payload: { order: string } }>(
          db,
          "SELECT payload FROM offline_operations WHERE device_id=$1 AND status='applied' AND payload->>'kind'='order' AND payload->>'order'=$2",
          [a.device, event.order],
        );
        if (!order) throw new Error("Commande locale introuvable.");
        const items = await rows<{ id: string }>(
          db,
          "SELECT id FROM order_items WHERE order_id=$1 ORDER BY id",
          [event.order],
        );
        for (const i of items) await changeItem(db, r, i.id, event.kind, user);
        if (event.kind === "cancelled")
          await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
            event.order,
          ]);
      }
      await db.query(
        "INSERT INTO offline_operations(id,device_id,payload,payload_hash,status,order_id) VALUES($1,$2,$3,$4,'applied',$5) ON CONFLICT(id) DO UPDATE SET status='applied',order_id=excluded.order_id,error=NULL",
        [event.id, a.device, JSON.stringify(event), hash, event.order],
      );
      await log(
        db,
        r,
        user.id,
        `Synchronisation hors ligne : ${event.kind}`,
        event.order,
      );
      await db.exec("RELEASE SAVEPOINT offline_event");
      results.push({ id: event.id, status: "applied" });
    } catch (e) {
      await db.exec("ROLLBACK TO SAVEPOINT offline_event");
      const error =
        e instanceof Error && !/query|constraint|SELECT|INSERT/.test(e.message)
          ? e.message
          : "Conflit de synchronisation.";
      await db.query(
        "INSERT INTO offline_operations(id,device_id,payload,payload_hash,status,error) VALUES($1,$2,$3,$4,'conflict',$5) ON CONFLICT(id) DO UPDATE SET status='conflict',error=excluded.error",
        [event.id, a.device, JSON.stringify(event), hash, error],
      );
      results.push({ id: event.id, status: "conflict", error });
      await db.exec("RELEASE SAVEPOINT offline_event");
    }
  }
  return { results };
}
