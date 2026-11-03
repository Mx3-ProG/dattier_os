import { randomUUID } from "node:crypto";

import { z } from "zod";
import { one, rows, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log } from "@/features/orders/service";
import { commerce } from "@/features/commerce/service";
import { defaultConfig } from "./defaults";
import { siteConfigSchema, SCHEMA_VERSION, type SiteConfig } from "./schema";
import {
  checkInvariants,
  defaultCmsSettings,
  enforceLocks,
  slugError,
  stable,
  type CmsSettings,
  type Role,
} from "./rules";
import { registry } from "./registry";
import type { PlaceholderContext } from "./text";
import { cmsMedia } from "./media";

export type SiteScope = { user: Actor; role: Role };
export function website(SHOP: string) {
  const { listMedia } = cmsMedia(SHOP);
  const shopSettings = (db: DB) => commerce(SHOP).settings(db);
  /* ───────────────────────── Access ───────────────────────── */

  /** Server-side gate: membership of the shop, then the `website` permission. */
  async function siteScope(db: DB, user: Actor): Promise<SiteScope> {
    const scoped = await scope(db, user, SHOP);
    requirePermission(scoped.roles ?? scoped.role, "website");
    return {
      user: scoped,
      // Only the platform super admin bypasses the editor locks; owners edit their own site.
      role: (scoped.roles ?? [scoped.role]).includes("SUPER_ADMIN")
        ? "SUPER_ADMIN"
        : "OWNER",
    };
  }

  /* ───────────────────────── Reading ───────────────────────── */

  /** Validates a stored configuration; future schema upgrades go here. */
  function parseConfig(raw: unknown): SiteConfig {
    const version = (raw as { schemaVersion?: number } | null)?.schemaVersion;
    if (version !== SCHEMA_VERSION)
      throw new Error(`Version de configuration inconnue : ${version}.`);
    return siteConfigSchema.parse(raw) as SiteConfig;
  }
  type CmsRow = {
    draft: unknown;
    draft_revision: number;
    draft_updated_at: string | null;
    draft_updated_by: string | null;
    published_version_id: string | null;
    settings: Partial<CmsSettings>;
  };
  async function cmsRow(db: DB, lock = false) {
    return one<CmsRow>(
      db,
      `SELECT * FROM restaurant_cms WHERE restaurant_id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [SHOP],
    );
  }
  async function cmsSettings(db: DB): Promise<CmsSettings> {
    return { ...defaultCmsSettings(), ...(await cmsRow(db)).settings };
  }
  async function publishedVersion(db: DB) {
    return (
      (
        await rows<{
          id: string;
          number: number;
          config: unknown;
          published_at: string;
          published_by: string | null;
        }>(
          db,
          "SELECT v.id,v.number,v.config,v.published_at,v.published_by FROM cms_versions v JOIN restaurant_cms c ON c.published_version_id=v.id WHERE c.restaurant_id=$1 AND v.restaurant_id=$1",
          [SHOP],
        )
      )[0] ?? null
    );
  }
  /**
   * Configuration shown to visitors. Without a publication (or if the stored
   * one is unreadable) the built-in defaults are served, so the site never breaks.
   */
  async function getPublishedConfig(db: DB): Promise<SiteConfig> {
    try {
      const v = await publishedVersion(db);
      return v ? parseConfig(v.config) : defaultConfig();
    } catch (error) {
      console.error(
        JSON.stringify({ level: "site-config-invalid", error: String(error) }),
      );
      return defaultConfig();
    }
  }
  async function currentDraft(db: DB, row?: CmsRow) {
    const r = row ?? (await cmsRow(db));
    if (r.draft) return parseConfig(r.draft);
    return getPublishedConfig(db);
  }
  async function getVersionConfig(db: DB, id: string) {
    return parseConfig(
      (
        await one<{ config: unknown }>(
          db,
          "SELECT config FROM cms_versions WHERE id=$1 AND restaurant_id=$2",
          [id, SHOP],
        )
      ).config,
    );
  }
  async function getDraftConfig(db: DB) {
    return currentDraft(db);
  }

  /** Values for {{restaurant.*}}: business data from the CRM, presentation data from the CMS. */
  async function placeholderContext(
    db: DB,
    config: SiteConfig,
  ): Promise<PlaceholderContext> {
    const restaurant = await rows<{
      name: string;
      address: string;
      phone: string;
    }>(db, "SELECT name,address,phone FROM restaurants WHERE id=$1", [SHOP]);
    const shop = await shopSettings(db).catch(() => null);
    const days = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
    const hours = shop
      ? [1, 2, 3, 4, 5, 6, 0]
          .map((d) => {
            const p = shop.hours
              .filter((h) => h.day === d)
              .toSorted((a, b) => a.open.localeCompare(b.open));
            return p.length
              ? `${days[d]} ${p.map((h) => `${h.open}–${h.close}`).join(", ")}`
              : "";
          })
          .filter(Boolean)
          .join(" · ")
      : "";
    return {
      name: config.branding.publicName || restaurant[0]?.name || "",
      address: shop?.address || restaurant[0]?.address || "",
      phone: shop?.phone || restaurant[0]?.phone || "",
      opening_hours: hours,
      email: config.branding.email,
      description: config.branding.description,
      logo: config.branding.logo.src,
      primary_color: config.theme.colors.primary,
    };
  }

  async function editorState(db: DB, s: SiteScope) {
    const row = await cmsRow(db);
    const published = await publishedVersion(db);
    const draft = await currentDraft(db, row);
    const names = await rows<{ id: string; name: string }>(
      db,
      "SELECT id,name FROM profiles",
    );
    const name = (id: string | null) =>
      names.find((n) => n.id === id)?.name ?? id;
    return {
      role: s.role,
      config: draft,
      revision: row.draft_revision,
      draftSavedAt: row.draft_updated_at,
      draftSavedBy: name(row.draft_updated_by),
      published: published
        ? {
            id: published.id,
            number: published.number,
            at: published.published_at,
            by: name(published.published_by),
          }
        : null,
      unpublished:
        stable(draft) !==
        stable(published ? parseConfig(published.config) : defaultConfig()),
      settings: { ...defaultCmsSettings(), ...row.settings },
      defaults: defaultConfig(),
      context: await placeholderContext(db, draft),
    };
  }
  async function versions(db: DB) {
    return rows<{
      id: string;
      number: number;
      summary: string;
      restored_from: number | null;
      published_at: string;
      published_by: string | null;
      current: boolean;
    }>(
      db,
      `SELECT v.id,v.number,v.summary,v.restored_from,v.published_at,coalesce(p.name,v.published_by) AS published_by,
            v.id=(SELECT published_version_id FROM restaurant_cms WHERE restaurant_id=$1) AS current
     FROM cms_versions v LEFT JOIN profiles p ON p.id=v.published_by WHERE v.restaurant_id=$1 ORDER BY v.number DESC`,
      [SHOP],
    );
  }

  /* ───────────────────────── Writing ───────────────────────── */

  const actionSchema = z.discriminatedUnion("op", [
    z.object({
      op: z.literal("save"),
      revision: z.number().int().min(0),
      config: z.unknown(),
    }),
    z.object({
      op: z.literal("publish"),
      revision: z.number().int().min(0),
      summary: z.string().trim().max(300).default(""),
    }),
    z.object({ op: z.literal("restore"), id: z.string().min(1) }),
    z.object({
      op: z.literal("settings"),
      keepVersions: z.number().int().min(3).max(200),
      allowedTypes: z.array(z.string()).max(40),
    }),
    z.object({ op: z.literal("deleteMedia"), id: z.string().uuid() }),
  ]);

  async function writeDraft(db: DB, config: SiteConfig, user: string) {
    await db.query(
      "UPDATE restaurant_cms SET draft=$1,draft_revision=draft_revision+1,draft_updated_at=clock_timestamp(),draft_updated_by=$2 WHERE restaurant_id=$3",
      [JSON.stringify(config), user, SHOP],
    );
    return (await cmsRow(db)).draft_revision;
  }
  async function insertVersion(
    db: DB,
    config: SiteConfig,
    user: string,
    summary: string,
    restoredFrom: number | null,
  ) {
    const number = (
      await one<{ n: number }>(
        db,
        "SELECT coalesce(max(number),0)+1 AS n FROM cms_versions WHERE restaurant_id=$1",
        [SHOP],
      )
    ).n;
    const id = randomUUID();
    await db.query(
      "INSERT INTO cms_versions(id,number,schema_version,config,summary,restored_from,published_by,restaurant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        number,
        SCHEMA_VERSION,
        JSON.stringify(config),
        summary,
        restoredFrom,
        user,
        SHOP,
      ],
    );
    await db.query(
      "UPDATE restaurant_cms SET published_version_id=$1 WHERE restaurant_id=$2",
      [id, SHOP],
    );
    const keep = { ...defaultCmsSettings(), ...(await cmsRow(db)).settings }
      .keepVersions;
    // Older versions beyond the configured count; the published one is never pruned.
    await db.query(
      "DELETE FROM cms_versions WHERE restaurant_id=$2 AND number<=(SELECT max(number) FROM cms_versions WHERE restaurant_id=$2)-$1 AND id<>(SELECT published_version_id FROM restaurant_cms WHERE restaurant_id=$2)",
      [keep, SHOP],
    );
    return number;
  }

  async function siteAction(db: DB, s: SiteScope, raw: unknown) {
    const a = actionSchema.parse(raw);
    const row = await cmsRow(db, true);
    const settings: CmsSettings = { ...defaultCmsSettings(), ...row.settings };
    switch (a.op) {
      case "save": {
        if (a.revision !== row.draft_revision)
          throw new Error(
            "Le brouillon a été modifié entre-temps (autre onglet ou autre administrateur). Rechargez avant d’enregistrer.",
          );
        const parsed = siteConfigSchema.safeParse(a.config);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new Error(
            `Données invalides (${issue.path.join(" › ")}) : ${issue.message}`,
          );
        }
        const next = parsed.data as SiteConfig;
        const validateMedia = async (value: unknown): Promise<void> => {
          if (typeof value === "string" && value.startsWith("/api/cms/")) {
            const prefix = `/api/cms/${SHOP}/media/`;
            if (!value.startsWith(prefix))
              throw new Error("Média d’un autre restaurant refusé.");
            await one(
              db,
              "SELECT id FROM cms_media WHERE restaurant_id=$1 AND file=$2 AND archived_at IS NULL",
              [SHOP, value.slice(prefix.length)],
            );
          } else if (value && typeof value === "object") {
            for (const v of Object.values(value)) await validateMedia(v);
          }
        };
        await validateMedia(next);
        enforceLocks(await currentDraft(db, row), next, s.role, settings);
        const revision = await writeDraft(db, next, s.user.id);
        await log(db, SHOP, s.user.id, "Site : brouillon enregistré");
        return { revision };
      }
      case "publish": {
        if (a.revision !== row.draft_revision)
          throw new Error(
            "Enregistrez la dernière version du brouillon avant de publier.",
          );
        const draft = await currentDraft(db, row);
        checkInvariants(draft);
        if (
          draft.seo.noIndex === false &&
          (!draft.legal.operator || !draft.legal.email || !draft.legal.host)
        )
          throw new Error(
            "Complétez l’identité de l’exploitant et l’hébergeur avant d’activer l’indexation.",
          );
        const number = await insertVersion(
          db,
          draft,
          s.user.id,
          a.summary,
          null,
        );
        await log(db, SHOP, s.user.id, `Site : version ${number} publiée`);
        return { number };
      }
      case "restore": {
        const old = await getVersionConfig(db, a.id);
        const from = (
          await one<{ number: number }>(
            db,
            "SELECT number FROM cms_versions WHERE id=$1 AND restaurant_id=$2",
            [a.id, SHOP],
          )
        ).number;
        // A restore is a change like any other: an administrator may only restore what locks permit.
        enforceLocks(await currentDraft(db, row), old, s.role, settings);
        const revision = await writeDraft(db, old, s.user.id);
        const number = await insertVersion(
          db,
          old,
          s.user.id,
          `Restauration de la version ${from}`,
          from,
        );
        await log(
          db,
          SHOP,
          s.user.id,
          `Site : version ${from} restaurée (nouvelle version ${number})`,
        );
        return { number, revision };
      }
      case "settings": {
        if (s.role !== "SUPER_ADMIN")
          throw new Error(
            "Réglage réservé au super-administrateur : accès refusé.",
          );
        const allowedTypes = a.allowedTypes.filter(
          (t) => t in registry && registry[t as keyof typeof registry].addable,
        );
        await db.query(
          "UPDATE restaurant_cms SET settings=$1 WHERE restaurant_id=$2",
          [
            JSON.stringify({ keepVersions: a.keepVersions, allowedTypes }),
            SHOP,
          ],
        );
        await log(db, SHOP, s.user.id, "Site : réglages du CMS modifiés");
        return { ok: true };
      }
      case "deleteMedia": {
        const media = await one<{ file: string }>(
          db,
          "SELECT file FROM cms_media WHERE id=$1 AND restaurant_id=$2",
          [a.id, SHOP],
        );
        const used = [
          JSON.stringify(row.draft ?? ""),
          ...(
            await rows<{ c: string }>(
              db,
              "SELECT config::text AS c FROM cms_versions WHERE restaurant_id=$1",
              [SHOP],
            )
          ).map((v) => v.c),
        ];
        if (used.some((c) => c.includes(media.file)))
          throw new Error(
            "Ce média est utilisé par le brouillon ou une version conservée : retirez-le d’abord.",
          );
        await db.query(
          "UPDATE cms_media SET archived_at=now() WHERE id=$1 AND restaurant_id=$2",
          [a.id, SHOP],
        );

        await log(db, SHOP, s.user.id, "Site : média supprimé", a.id);
        return { ok: true };
      }
    }
  }
  return {
    siteScope,
    parseConfig,
    cmsSettings,
    getPublishedConfig,
    getVersionConfig,
    getDraftConfig,
    placeholderContext,
    editorState,
    versions,
    siteAction,
    listMedia,
    slugError,
  };
}
