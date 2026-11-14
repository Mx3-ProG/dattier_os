import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";

/**
 * Codes PIN du personnel. Le PIN ne connecte jamais personne : il identifie la personne
 * qui valide une étape sensible (commande, encaissement, annulation), même sur un appareil
 * partagé connecté avec un autre compte. Haché avec scrypt et un sel propre à chaque PIN.
 */
const derive = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;
export const PIN_MAX_ATTEMPTS = 5;
export const pinCode = z.string().regex(/^\d{4,6}$/, "Le code PIN contient 4 à 6 chiffres.");
export const pinInput = z.object({ profile: z.string().min(1).max(100), code: pinCode });
export type PinInput = z.infer<typeof pinInput>;

let schemaReady = false;
/** Déploiement avant migration : sans la migration 200, la fonctionnalité reste inactive. */
export async function staffSchemaReady(db: DB) {
  if (schemaReady) return true;
  const { ok } = await one<{ ok: boolean }>(
    db,
    "SELECT to_regclass('public.staff_activity') IS NOT NULL AS ok",
  );
  schemaReady = ok;
  return ok;
}

/** Refuse les codes trop faciles à deviner : chiffres identiques ou suites (1234, 9876). */
export function weakPin(code: string) {
  const digits = [...code].map(Number);
  if (digits.every((d) => d === digits[0])) return true;
  const step = digits[1] - digits[0];
  return Math.abs(step) === 1 && digits.every((d, i) => i === 0 || d - digits[i - 1] === step);
}

export async function hashPin(code: string) {
  const salt = randomBytes(16);
  const key = await derive(code, salt, 32);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPinHash(code: string, stored: string) {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(code, Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function pinRequired(db: DB, r: string) {
  if (!(await staffSchemaReady(db))) return false;
  const row = await one<{ required: boolean }>(
    db,
    "SELECT staff_pin_required AS required FROM restaurants WHERE id=$1",
    [r],
  );
  return row.required;
}

export type StaffKind =
  | "order"
  | "payment"
  | "cancel_item"
  | "confirm_order"
  | "decline_order"
  | "pin_failed"
  | "pin_locked"
  | "pin_created"
  | "pin_reset";

export async function recordStaffActivity(
  db: DB,
  r: string,
  entry: {
    profile: string;
    device: string | null;
    kind: StaffKind;
    object?: string | null;
    amount?: number | null;
    detail?: string;
  },
) {
  await db.query(
    "INSERT INTO staff_activity(id,restaurant_id,profile_id,device_profile_id,kind,object_id,amount,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      randomUUID(),
      r,
      entry.profile,
      entry.device,
      entry.kind,
      entry.object ?? null,
      entry.amount ?? null,
      (entry.detail ?? "").slice(0, 300),
    ],
  );
}

/** État du PIN pour la personne connectée et liste des personnes qui peuvent valider. */
export async function staffState(db: DB, r: string, user: Actor) {
  if (!(await staffSchemaReady(db)))
    return { pinRequired: false, hasPin: true, operators: [] as { id: string; name: string }[] };
  const required = await pinRequired(db, r);
  const mine = await rows(
    db,
    "SELECT 1 FROM staff_pins WHERE restaurant_id=$1 AND profile_id=$2",
    [r, user.id],
  );
  const operators = required
    ? await rows<{ id: string; name: string }>(
        db,
        "SELECT DISTINCT p.id,p.name FROM staff_pins s JOIN profiles p ON p.id=s.profile_id JOIN memberships m ON m.profile_id=s.profile_id AND m.restaurant_id=s.restaurant_id WHERE s.restaurant_id=$1 AND p.status='active' ORDER BY p.name",
        [r],
      )
    : [];
  return { pinRequired: required, hasPin: mine.length > 0, operators };
}

export const setPinSchema = z.object({
  action: z.literal("setPin"),
  code: pinCode,
  confirm: pinCode,
  current: pinCode.optional(),
});

/** Chacun crée ou change son propre PIN ; changer exige l’ancien code. */
export async function setOwnPin(db: DB, r: string, user: Actor, a: z.infer<typeof setPinSchema>) {
  if (!(await staffSchemaReady(db)))
    throw new Error("Codes PIN indisponibles : mise à jour de la base en attente.");
  if (a.code !== a.confirm) throw new Error("Les deux codes PIN ne correspondent pas.");
  if (weakPin(a.code))
    throw new Error("Code trop simple : évitez les chiffres identiques et les suites (1234).");
  const existing = await rows<{ pin_hash: string; locked: boolean }>(
    db,
    "SELECT pin_hash,coalesce(locked_until>now(),false) AS locked FROM staff_pins WHERE restaurant_id=$1 AND profile_id=$2 FOR UPDATE",
    [r, user.id],
  );
  if (existing.length) {
    if (existing[0].locked)
      throw new Error("Code PIN bloqué : demandez une réinitialisation à un administrateur.");
    if (!a.current) throw new Error("Saisissez votre code PIN actuel.");
    if (!(await verifyPinHash(a.current, existing[0].pin_hash))) {
      // Pas d’exception ici : l’essai raté doit être enregistré (la route lève l’erreur après validation).
      const after = await one<{ locked_until: string | null }>(
        db,
        "SELECT * FROM app.record_pin_attempt($1,$2,false)",
        [r, user.id],
      );
      return {
        hasPin: true,
        error: after.locked_until
          ? "Trop d’essais : votre code PIN est bloqué 15 minutes."
          : "Code PIN actuel incorrect.",
      };
    }
  }
  await db.query(
    `INSERT INTO staff_pins(restaurant_id,profile_id,pin_hash) VALUES($1,$2,$3)
     ON CONFLICT(restaurant_id,profile_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,failed_attempts=0,locked_until=NULL,set_at=now()`,
    [r, user.id, await hashPin(a.code)],
  );
  await recordStaffActivity(db, r, {
    profile: user.id,
    device: user.id,
    kind: "pin_created",
    detail: existing.length ? "Code PIN modifié" : "Code PIN créé",
  });
  return { hasPin: true, error: undefined as string | undefined };
}

/**
 * Vérifie le PIN dans sa propre transaction, validée même en cas d’échec : le compteur
 * d’essais et le verrouillage doivent survivre à l’annulation de l’action refusée.
 * Renvoie la personne identifiée, ou rien quand l’établissement n’exige pas de PIN.
 */
export async function verifyOperator(
  transaction: <T>(fn: (tx: DB) => Promise<T>) => Promise<T>,
  r: string,
  device: Actor,
  pin: PinInput | undefined,
): Promise<{ id: string; name: string } | undefined> {
  const outcome = await transaction(async (tx) => {
    if (!(await pinRequired(tx, r))) return { skip: true as const };
    if (!pin) return { error: "Code PIN requis pour valider cette étape." };
    const found = await rows<{ pin_hash: string; locked_until: string | null; locked: boolean; name: string }>(
      tx,
      "SELECT s.pin_hash,s.locked_until,coalesce(s.locked_until>now(),false) AS locked,p.name FROM staff_pins s JOIN profiles p ON p.id=s.profile_id WHERE s.restaurant_id=$1 AND s.profile_id=$2 AND p.status='active'",
      [r, pin.profile],
    );
    if (!found.length) return { error: "Ce membre n’a pas encore créé son code PIN." };
    const row = found[0];
    if (row.locked)
      return {
        error: `Code PIN bloqué jusqu’à ${new Date(row.locked_until!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}. Un administrateur peut le réinitialiser.`,
      };
    const ok = await verifyPinHash(pin.code, row.pin_hash);
    const after = await one<{ failed_attempts: number; locked_until: string | null }>(
      tx,
      "SELECT * FROM app.record_pin_attempt($1,$2,$3)",
      [r, pin.profile, ok],
    );
    if (ok) return { operator: { id: pin.profile, name: row.name } };
    const locked = !!after.locked_until;
    await recordStaffActivity(tx, r, {
      profile: pin.profile,
      device: device.id,
      kind: locked ? "pin_locked" : "pin_failed",
      detail: locked ? "PIN bloqué 15 minutes après 5 erreurs" : "Code PIN incorrect",
    });
    return {
      error: locked
        ? "Trop d’essais : ce code PIN est bloqué 15 minutes."
        : `Code PIN incorrect. Encore ${PIN_MAX_ATTEMPTS - after.failed_attempts} essai(s) avant blocage.`,
    };
  });
  if ("error" in outcome) throw new Error(outcome.error);
  return "operator" in outcome ? outcome.operator : undefined;
}

/** L’administrateur efface un PIN (oubli, blocage) : la personne devra en recréer un. */
export async function resetPin(db: DB, r: string, admin: Actor, profile: string) {
  const { count } = await one<{ count: number }>(
    db,
    "WITH d AS (DELETE FROM staff_pins WHERE restaurant_id=$1 AND profile_id=$2 RETURNING 1) SELECT count(*)::int AS count FROM d",
    [r, profile],
  );
  if (!count) throw new Error("Ce membre n’a pas de code PIN à réinitialiser.");
  await recordStaffActivity(db, r, {
    profile,
    device: admin.id,
    kind: "pin_reset",
    detail: "Code PIN réinitialisé par un administrateur",
  });
}
