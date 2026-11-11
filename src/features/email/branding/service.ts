import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, type DB } from "@/lib/database/db";
import { brandSchema, readBrand, type EmailBrand } from "./brand";
import {
  customTemplateKey,
  defaultCustomContent,
  emailTriggers,
  isTriggerKey,
  readContent,
  templateContentSchema,
  type TemplateCategory,
  type TemplateContent,
} from "./templates";

/** Persistance de la personnalisation, sous RLS (établissement ouvert, add-on installé). */
export async function readBrandSettings(db: DB, restaurant: string): Promise<EmailBrand> {
  const [row] = await rows<{ settings: unknown }>(db, "SELECT settings FROM email_brands WHERE restaurant_id=$1", [restaurant]);
  return readBrand(row?.settings);
}

export async function saveBrandSettings(db: DB, restaurant: string, userId: string, raw: unknown) {
  const brand = brandSchema.parse(raw);
  await db.query(
    `INSERT INTO email_brands(restaurant_id,settings,updated_by) VALUES($1,$2::jsonb,$3)
     ON CONFLICT(restaurant_id) DO UPDATE SET settings=excluded.settings,updated_by=excluded.updated_by,updated_at=now()`,
    [restaurant, JSON.stringify(brand), userId],
  );
  return brand;
}

export type TemplateView = {
  key: string;
  name: string;
  category: TemplateCategory;
  content: TemplateContent;
  enabled: boolean;
  /** Déclencheur automatique (vs modèle libre envoyé à la main). */
  automatic: boolean;
  customized: boolean;
  updatedAt: string | null;
};

/** Déclencheurs (avec leur modèle effectif) puis modèles libres non archivés. */
export async function readTemplates(db: DB, restaurant: string): Promise<TemplateView[]> {
  const stored = await rows<{ key: string; name: string; category: TemplateCategory; content: unknown; enabled: boolean; archived_at: string | null; updated_at: string }>(
    db,
    "SELECT key,name,category,content,enabled,archived_at,updated_at FROM email_templates WHERE restaurant_id=$1 ORDER BY updated_at DESC",
    [restaurant],
  );
  const byKey = new Map(stored.map((row) => [row.key, row]));
  const automatic = emailTriggers.map((trigger): TemplateView => {
    const row = byKey.get(trigger.key);
    return {
      key: trigger.key,
      name: trigger.label,
      category: trigger.category,
      content: readContent(row?.content, trigger.defaults),
      enabled: !!row?.enabled && !row.archived_at,
      automatic: true,
      customized: !!row,
      updatedAt: row?.updated_at ?? null,
    };
  });
  const custom = stored
    .filter((row) => customTemplateKey.test(row.key) && !row.archived_at)
    .map((row): TemplateView => ({
      key: row.key,
      name: row.name,
      category: row.category,
      content: readContent(row.content, defaultCustomContent),
      enabled: false,
      automatic: false,
      customized: true,
      updatedAt: row.updated_at,
    }));
  return [...automatic, ...custom];
}

export const templateSaveSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9.-]{1,63}$/).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    category: z.enum(["transactional", "marketing"]).optional(),
    content: templateContentSchema,
    enabled: z.boolean().optional(),
  })
  .strict();

/** Enregistre un modèle de déclencheur ou un modèle libre (créé si `key` est absent). */
export async function saveTemplate(db: DB, restaurant: string, userId: string, raw: unknown) {
  const input = templateSaveSchema.parse(raw);
  const trigger = input.key && isTriggerKey(input.key) ? emailTriggers.find((entry) => entry.key === input.key)! : null;
  if (input.key && !trigger && !customTemplateKey.test(input.key)) throw new Error("Modèle inconnu.");
  const key = input.key ?? `custom-${randomUUID().slice(0, 8)}`;
  const name = trigger ? trigger.label : (input.name ?? "Nouveau modèle");
  // Une automatisation garde la catégorie de son déclencheur (transactionnel).
  const category = trigger ? trigger.category : (input.category ?? "marketing");
  const enabled = trigger ? (input.enabled ?? false) : false;
  await db.query(
    `INSERT INTO email_templates(restaurant_id,key,name,category,content,enabled,updated_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)
     ON CONFLICT(restaurant_id,key) DO UPDATE SET name=excluded.name,category=excluded.category,content=excluded.content,
       enabled=excluded.enabled,archived_at=NULL,updated_by=excluded.updated_by,updated_at=now()`,
    [restaurant, key, name, category, JSON.stringify(input.content), enabled, userId],
  );
  return key;
}

/** Active ou coupe une automatisation sans toucher à son contenu. */
export async function setAutomation(db: DB, restaurant: string, userId: string, key: string, enabled: boolean) {
  const trigger = emailTriggers.find((entry) => entry.key === key);
  if (!trigger) throw new Error("Automatisation inconnue.");
  await db.query(
    `INSERT INTO email_templates(restaurant_id,key,name,category,content,enabled,updated_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)
     ON CONFLICT(restaurant_id,key) DO UPDATE SET enabled=excluded.enabled,archived_at=NULL,updated_by=excluded.updated_by,updated_at=now()`,
    [restaurant, key, trigger.label, trigger.category, JSON.stringify(trigger.defaults), enabled, userId],
  );
}

/** Modèle de déclencheur : retour au texte par défaut. Modèle libre : archivé (historique conservé). */
export async function resetTemplate(db: DB, restaurant: string, userId: string, key: string) {
  const trigger = emailTriggers.find((entry) => entry.key === key);
  if (trigger) {
    await db.query(
      "UPDATE email_templates SET content=$3::jsonb,updated_by=$4,updated_at=now() WHERE restaurant_id=$1 AND key=$2",
      [restaurant, key, JSON.stringify(trigger.defaults), userId],
    );
    return;
  }
  if (!customTemplateKey.test(key)) throw new Error("Modèle inconnu.");
  await db.query(
    "UPDATE email_templates SET archived_at=now(),updated_by=$3,updated_at=now() WHERE restaurant_id=$1 AND key=$2",
    [restaurant, key, userId],
  );
}
