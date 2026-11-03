import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, type DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log } from "@/features/orders/service";
import { website } from "@/features/cms/service";
import { runSeoAudit, type AuditReport } from "./audit";
import { seoFacts, platformUrl } from "./server";
import { siteUrls } from "./urls";
import { llmsEnabled } from "./llms";

/** "SEO & visibilité IA" dashboard. `user` is already scoped to the restaurant. */
export async function seoState(db: DB, r: string, user: Actor) {
  requirePermission(user.roles ?? user.role, "website");
  const audits = await rows<{
    id: string;
    trigger: string;
    report: AuditReport;
    created_at: string;
  }>(
    db,
    "SELECT id,trigger,report,created_at FROM seo_audits WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 20",
    [r],
  );
  const facts = await seoFacts(db, r);
  const config = await website(r).getPublishedConfig(db);
  const urls = siteUrls({
    restaurant: r,
    platformUrl: platformUrl(),
    primaryHost: facts.primaryHost,
    requestHost: facts.primaryHost ?? new URL(platformUrl()).hostname,
  });
  return {
    latest: audits[0] ?? null,
    previous: audits[1] ?? null,
    history: audits.map((a) => ({
      id: a.id,
      trigger: a.trigger,
      created_at: a.created_at,
      counts: a.report.counts,
    })),
    jobs: await rows(
      db,
      "SELECT dedupe_key,status,attempts,available_at,last_error,payload->>'trigger' AS trigger FROM outbox_jobs WHERE restaurant_id=$1 AND kind='seo_audit' AND status IN ('pending','running','failed') ORDER BY available_at",
      [r],
    ),
    observations: await rows(
      db,
      "SELECT o.id,o.observed_on::text AS observed_on,o.assistant,o.query,o.cited,o.evidence,coalesce(p.name,o.created_by) AS created_by FROM seo_ai_observations o LEFT JOIN profiles p ON p.id=o.created_by WHERE o.restaurant_id=$1 ORDER BY o.observed_on DESC,o.created_at DESC LIMIT 100",
      [r],
    ),
    links: {
      site: `${urls.canonicalBase}/`,
      sitemap: `${urls.canonicalBase}/sitemap.xml`,
      robots: facts.primaryHost ? `${urls.canonicalBase}/robots.txt` : null,
      llms: llmsEnabled(config) ? `${urls.canonicalBase}/llms.txt` : null,
    },
    // External sources that are not connected: the dashboard must say so, never estimate.
    integrations: {
      searchConsole: false,
      bingWebmaster: false,
      fieldData: false,
    },
  };
}

const observation = z.object({
  action: z.literal("observe"),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assistant: z.string().trim().min(1).max(60),
  query: z.string().trim().min(1).max(300),
  cited: z.boolean(),
  evidence: z.string().trim().max(1000).default(""),
});
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("audit") }),
  observation,
  z.object({ action: z.literal("deleteObservation"), id: z.string().uuid() }),
]);

export async function seoPerform(db: DB, r: string, user: Actor, raw: unknown) {
  requirePermission(user.roles ?? user.role, "website");
  const a = action.parse(raw);
  if (a.action === "audit") {
    const { id, report } = await runSeoAudit(db, r, `manuel (${user.name})`);
    await log(db, r, user.id, "SEO : analyse lancée", id);
    return { id, counts: report.counts };
  }
  if (a.action === "observe") {
    if (new Date(a.observedOn) > new Date())
      throw new Error("La date d’observation ne peut pas être dans le futur.");
    const id = randomUUID();
    await db.query(
      "INSERT INTO seo_ai_observations(id,restaurant_id,observed_on,assistant,query,cited,evidence,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, r, a.observedOn, a.assistant, a.query, a.cited, a.evidence, user.id],
    );
    await log(db, r, user.id, "SEO : observation IA ajoutée", id);
    return { id };
  }
  await db.query(
    "DELETE FROM seo_ai_observations WHERE id=$1 AND restaurant_id=$2",
    [a.id, r],
  );
  await log(db, r, user.id, "SEO : observation IA supprimée", a.id);
  return { removed: true };
}
