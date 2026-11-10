import { randomUUID, randomBytes, createHash } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log } from "@/features/orders/service";
import { requirePaidAddon } from "@/features/platform/entitlements";
const sectionSchema = z.object({
  id: z.uuid(),
  type: z.enum(["text", "image", "catalog"]),
  title: z.string().max(160),
  body: z.string().max(5000),
  visible: z.boolean(),
  locked: z.boolean(),
  asset: z.uuid().optional(),
});
export const siteSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().max(1200),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    font: z.enum(["system", "serif", "sans"]).default("system"),
    heroAsset: z.uuid().optional(),
    sections: z.array(sectionSchema).max(30).default([]),
    pages: z
      .array(
        z.object({
          slug: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .max(70),
          title: z.string().min(1).max(100),
          text: z.string().max(10000),
        }),
      )
      .max(20),
  })
  .refine(
    (s) =>
      new Set(s.pages.map((p) => p.slug)).size === s.pages.length &&
      new Set(s.sections.map((p) => p.id)).size === s.sections.length,
    "Pages en double.",
  );
export const siteAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    revision: z.number().int().min(0),
    document: siteSchema,
  }),
  z.object({ action: z.literal("publish"), revision: z.number().int().min(0) }),
  z.object({
    action: z.literal("restore"),
    version: z.string(),
    revision: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("domain"),
    hostname: z
      .string()
      .toLowerCase()
      .regex(
        /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      ),
  }),
  z.object({
    action: z.literal("verifyDomain"),
    hostname: z.string().max(253),
  }),
  z.object({
    action: z.literal("removeDomain"),
    hostname: z.string().max(253),
  }),
  z.object({
    action: z.literal("primaryDomain"),
    hostname: z.string().max(253),
  }),
]);
export async function publicSite(db: DB, r: string) {
  const row = await one<{
    name: string;
    address: string;
    phone: string;
    published: unknown;
  }>(
    db,
    "SELECT r.name,r.address,r.phone,s.published FROM restaurants r JOIN site_documents s ON s.restaurant_id=r.id WHERE r.id=$1",
    [r],
  );
  return {
    ...row,
    document: row.published ? siteSchema.parse(row.published) : null,
    published: undefined,
  };
}
export async function siteState(db: DB, r: string, user: Actor) {
  user = await scope(db, user, r);
  requirePermission(user.roles ?? user.role, "catalog");
  return {
    site: await one(db, "SELECT * FROM site_documents WHERE restaurant_id=$1", [
      r,
    ]),
    versions: await rows(
      db,
      "SELECT id,revision,created_at FROM site_publications WHERE restaurant_id=$1 ORDER BY revision DESC LIMIT 50",
      [r],
    ),
    canLock: (user.roles ?? [user.role]).some((role) =>
      ["OWNER", "SUPER_ADMIN"].includes(role),
    ),
    domains: await rows(
      db,
      "SELECT hostname,verified_at,is_primary FROM restaurant_domains WHERE restaurant_id=$1 ORDER BY is_primary DESC,hostname",
      [r],
    ),
  };
}
export async function sitePerform(
  db: DB,
  r: string,
  user: Actor,
  raw: unknown,
) {
  user = await scope(db, user, r);
  requirePermission(user.roles ?? user.role, "catalog");
  const a = siteAction.parse(raw);
  // Removing a domain stays possible after the add-on ends.
  if (["domain", "verifyDomain", "primaryDomain"].includes(a.action))
    await requirePaidAddon(db, r, "domain");
  if (a.action === "domain") {
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO restaurant_domains(hostname,restaurant_id,verification_hash) VALUES($1,$2,$3)",
      [a.hostname, r, createHash("sha256").update(token).digest("hex")],
    );
    await log(db, r, user.id, "Domaine proposé", a.hostname);
    return {
      record: `_atacuisine.${a.hostname}`,
      value: `atacuisine-verification=${token}`,
    };
  }
  if (a.action === "verifyDomain") {
    const d = await one<{ verification_hash: string }>(
      db,
      "SELECT verification_hash FROM restaurant_domains WHERE hostname=$1 AND restaurant_id=$2",
      [a.hostname, r],
    );
    const records = await resolveTxt(`_atacuisine.${a.hostname}`);
    const valid = records.some((v) => {
      const txt = v.join("");
      return (
        txt.startsWith("atacuisine-verification=") &&
        createHash("sha256").update(txt.slice(21)).digest("hex") ===
          d.verification_hash
      );
    });
    if (!valid) throw new Error("Preuve DNS absente.");
    await db.query(
      "UPDATE restaurant_domains SET verified_at=now() WHERE hostname=$1 AND restaurant_id=$2",
      [a.hostname, r],
    );
    await log(db, r, user.id, "Domaine vérifié", a.hostname);
    return { verified: true };
  }
  if (a.action === "removeDomain") {
    await db.query(
      "DELETE FROM restaurant_domains WHERE hostname=$1 AND restaurant_id=$2",
      [a.hostname, r],
    );
    await log(db, r, user.id, "Domaine retiré", a.hostname);
    return { removed: true };
  }
  if (a.action === "primaryDomain") {
    // Only a verified domain of this restaurant can become the canonical host.
    await one(
      db,
      "SELECT hostname FROM restaurant_domains WHERE hostname=$1 AND restaurant_id=$2 AND verified_at IS NOT NULL",
      [a.hostname, r],
    );
    await db.query(
      "UPDATE restaurant_domains SET is_primary=false WHERE restaurant_id=$1 AND is_primary",
      [r],
    );
    await db.query(
      "UPDATE restaurant_domains SET is_primary=true WHERE hostname=$1 AND restaurant_id=$2",
      [a.hostname, r],
    );
    await log(db, r, user.id, "Domaine principal défini", a.hostname);
    return { primary: a.hostname };
  }
  const current = await one<{ draft: unknown; revision: number }>(
    db,
    "SELECT * FROM site_documents WHERE restaurant_id=$1 FOR UPDATE",
    [r],
  );
  if (current.revision !== a.revision)
    throw new Error("Le site a été modifié. Rechargez avant de continuer.");
  const revision = a.revision + 1;
  if (a.action === "save") {
    const old = siteSchema.safeParse(current.draft);
    const owner = (user.roles ?? [user.role]).some((role) =>
      ["OWNER", "SUPER_ADMIN"].includes(role),
    );
    if (!owner) {
      for (const section of old.success ? old.data.sections : []) {
        if (
          section.locked &&
          JSON.stringify(
            a.document.sections.find((s) => s.id === section.id),
          ) !== JSON.stringify(section)
        )
          throw new Error("Section verrouillée par le propriétaire.");
      }
      if (
        a.document.sections.some(
          (s) =>
            s.locked &&
            !(
              old.success &&
              old.data.sections.find((p) => p.id === s.id)?.locked
            ),
        )
      )
        throw new Error("Verrouillage réservé au propriétaire.");
    }
    const assets = [
      a.document.heroAsset,
      ...a.document.sections.map((s) => s.asset),
    ].filter(Boolean);
    for (const asset of assets)
      await one(
        db,
        "SELECT id FROM site_assets WHERE id=$1 AND restaurant_id=$2",
        [asset, r],
      );
    await db.query(
      "UPDATE site_documents SET draft=$2,revision=$3,updated_at=now() WHERE restaurant_id=$1",
      [r, JSON.stringify(a.document), revision],
    );
  } else if (a.action === "publish") {
    const document = siteSchema.parse(current.draft);
    await db.query(
      "UPDATE site_documents SET published=$2,revision=$3,updated_at=now() WHERE restaurant_id=$1",
      [r, JSON.stringify(document), revision],
    );
    await db.query(
      "INSERT INTO site_publications(id,restaurant_id,document,revision,created_by) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), r, JSON.stringify(document), revision, user.id],
    );
  } else {
    requirePermission(user.roles ?? user.role, "settings");
    const version = await one<{ document: unknown }>(
      db,
      "SELECT document FROM site_publications WHERE id=$1 AND restaurant_id=$2",
      [a.version, r],
    );
    await db.query(
      "UPDATE site_documents SET draft=$2,revision=$3,updated_at=now() WHERE restaurant_id=$1",
      [r, JSON.stringify(version.document), revision],
    );
  }
  await log(db, r, user.id, `Site : ${a.action}`);
  return { revision };
}
