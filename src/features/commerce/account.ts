import { randomUUID } from "node:crypto";
import { one, rows, type DB } from "@/infrastructure/database/db";
import type { Actor } from "@/infrastructure/auth/session";
export async function customerForActor(db: DB, r: string, user: Actor) {
  await one(db, "SELECT id FROM profiles WHERE id=$1 AND status='active'", [
    user.id,
  ]);
  if (!user.email) throw new Error("Connexion client vérifiée requise.");
  const restaurant = await one<{ organization_id: string }>(
    db,
    "SELECT organization_id FROM restaurants WHERE id=$1",
    [r],
  );
  const account = await one<{ id: string }>(
    db,
    "INSERT INTO organization_customers(id,organization_id,subject,email,name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,subject) DO UPDATE SET email=excluded.email,name=excluded.name RETURNING id",
    [randomUUID(), restaurant.organization_id, user.id, user.email, user.name],
  );
  const existing = await rows<{ id: string }>(
    db,
    "SELECT id FROM customers WHERE account_id=$1 AND restaurant_id=$2",
    [account.id, r],
  );
  if (existing.length) return existing[0].id;
  const id = randomUUID();
  const created = await one<{ id: string }>(
    db,
    "INSERT INTO customers(id,restaurant_id,name,contact,consent,points,account_id) VALUES($1,$2,$3,$4,false,0,$5) ON CONFLICT(restaurant_id,account_id) WHERE account_id IS NOT NULL DO UPDATE SET account_id=excluded.account_id RETURNING id",
    [id, r, user.name, user.email, account.id],
  );
  return created.id;
}

/** Ce que le client suit : articles lus, formations suivies, prestations en cours. */
export async function customerFollows(db: DB, customerId: string) {
  return rows<{
    kind: "article" | "course" | "service";
    ref_id: string;
    label: string;
    progress: number;
    updated_at: string;
  }>(
    db,
    "SELECT kind,ref_id,label,progress,updated_at FROM customer_follows WHERE customer_id=$1 ORDER BY updated_at DESC",
    [customerId],
  );
}

/**
 * Le client suit (ou arrête de suivre) un article, une formation ou une
 * prestation. La progression est libre de 0 à 100 : lue, en cours, terminée.
 */
export async function followItem(
  db: DB,
  restaurantId: string,
  customerId: string,
  input: { kind: "article" | "course" | "service"; refId: string; label?: string; progress?: number },
) {
  const kind = input.kind;
  const refId = String(input.refId || "").slice(0, 120);
  if (!refId) throw new Error("Référence manquante.");
  const progress = Math.max(0, Math.min(100, Math.round(input.progress ?? 0)));
  const label = String(input.label ?? "").slice(0, 200);
  return one<{ id: string }>(
    db,
    `INSERT INTO customer_follows(id,restaurant_id,customer_id,kind,ref_id,label,progress)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(restaurant_id,customer_id,kind,ref_id) DO UPDATE
       SET progress=EXCLUDED.progress,label=EXCLUDED.label,updated_at=now()
     RETURNING id`,
    [randomUUID(), restaurantId, customerId, kind, refId, label, progress],
  );
}

/** Le client arrête de suivre un contenu. */
export async function unfollowItem(
  db: DB,
  customerId: string,
  kind: "article" | "course" | "service",
  refId: string,
) {
  await db.query(
    "DELETE FROM customer_follows WHERE customer_id=$1 AND kind=$2 AND ref_id=$3",
    [customerId, kind, String(refId).slice(0, 120)],
  );
  return { ok: true };
}
