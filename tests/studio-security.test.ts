import { tick } from "../src/features/ops-security/engine";
import {
  archiveDay,
  verifyArchives,
} from "../src/features/ops-security/archive";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { website } from "../src/features/cms/service";
import {
  securityScope,
  listEvents,
  securityAction,
} from "../src/features/ops-security/service";
import { emit } from "../src/features/ops-security/events";
import { withDatabaseContext } from "../src/lib/database/context";
import { nestedDatabase } from "../src/lib/database/nested";
import type { DB } from "../src/lib/database/db";
let db: PGlite;
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(() => db.close());
const app = <T>(r: string, fn: (tx: DB) => Promise<T>) =>
  withDatabaseContext({ userId: "nadia", restaurantId: r }, () =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id','nadia',true),set_config('app.restaurant_id',$1,true),set_config('app.public','false',true)",
        [r],
      );
      return fn(tx);
    }),
  );
test("Studio complet : brouillon, publication, historique et isolation des médias", async () => {
  const cms = website("bernay");
  const state = await app("bernay", async (tx) =>
    cms.editorState(tx, await cms.siteScope(tx, owner)),
  );
  const config = structuredClone(state.config);
  config.seo.title = "Notre restaurant personnalisé";
  await app("bernay", async (tx) =>
    cms.siteAction(tx, await cms.siteScope(tx, owner), {
      op: "save",
      revision: state.revision,
      config,
    }),
  );
  assert.notEqual(
    (await app("bernay", (tx) => cms.getPublishedConfig(tx))).seo.title,
    config.seo.title,
  );
  await assert.rejects(
    app("bernay", async (tx) =>
      cms.siteAction(tx, await cms.siteScope(tx, owner), {
        op: "save",
        revision: state.revision,
        config,
      }),
    ),
    /modifié/,
  );
  await app("bernay", async (tx) =>
    cms.siteAction(tx, await cms.siteScope(tx, owner), {
      op: "publish",
      revision: state.revision + 1,
      summary: "Première publication",
    }),
  );
  assert.equal(
    (await app("bernay", (tx) => cms.getPublishedConfig(tx))).seo.title,
    config.seo.title,
  );
  assert.notEqual(
    (await app("atelier", (tx) => website("atelier").getPublishedConfig(tx)))
      .seo.title,
    config.seo.title,
  );
  const mediaConfig = structuredClone(config);
  mediaConfig.seo.ogImage =
    "/api/cms/atelier/media/11111111-1111-4111-8111-111111111111.webp";
  await assert.rejects(
    app("bernay", async (tx) =>
      cms.siteAction(tx, await cms.siteScope(tx, owner), {
        op: "save",
        revision: state.revision + 1,
        config: mediaConfig,
      }),
    ),
    /autre restaurant/,
  );
  const versions = await app("bernay", (tx) => cms.versions(tx));
  assert.equal(versions.length, 1);
});
test("Sécurité complète : journal masqué entre restaurants, secrets expurgés et accès métier refusé", async () => {
  await app("bernay", (tx) =>
    emit(tx, {
      severity: 3,
      event_type: "test.security",
      module: "security",
      action: "Test journal",
      message: "Une vérification",
      details: { password: "ne-jamais-conserver", token: "secret-jeton" },
    }),
  );
  const scope = await app("bernay", (tx) => securityScope(tx, owner, "bernay"));
  const events = await app("bernay", (tx) =>
    listEvents(nestedDatabase(tx), scope, {}),
  );
  assert.ok(JSON.stringify(events).includes("test.security"));
  assert.ok(!JSON.stringify(events).includes("ne-jamais-conserver"));
  const other = await app("atelier", async (tx) =>
    listEvents(
      nestedDatabase(tx),
      await securityScope(tx, owner, "atelier"),
      {},
    ),
  );
  assert.ok(!JSON.stringify(other).includes("test.security"));
  await assert.rejects(
    app("bernay", (tx) =>
      listEvents(nestedDatabase(tx), scope, { scope: "atelier" }),
    ),
    /Établissement non autorisé/,
  );
  await assert.rejects(
    app("bernay", (tx) =>
      listEvents(nestedDatabase(tx), scope, { scope: "platform" }),
    ),
    /Établissement non autorisé/,
  );
  await assert.rejects(
    app("bernay", (tx) =>
      securityScope(
        tx,
        { id: "sarah", name: "Sarah", role: "WAITER" },
        "bernay",
      ),
    ),
    /refusé/,
  );
  await assert.rejects(
    app("bernay", async (tx) =>
      securityAction(nestedDatabase(tx), scope, {
        op: "arbitrary-command",
        command: "anything",
      }),
    ),
  );
});

test("Sécurité : maintenance persistante et archives quotidiennes intègres", async () => {
  await app("bernay", (tx) => tick(nestedDatabase(tx), { archiveDir: null }));
  const day = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  await app("bernay", (tx) =>
    archiveDay(nestedDatabase(tx), day, { archiveDir: null }),
  );
  const issues = await app("bernay", (tx) =>
    verifyArchives(nestedDatabase(tx)),
  );
  assert.equal(issues.issues.length, 0);
  await assert.rejects(
    app("bernay", (tx) => tx.query("DELETE FROM ops_security_archives")),
    /ajout seul/,
  );
});

test("archives de sécurité : même journée indépendante pour deux établissements", async () => {
  const day = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  for (const restaurant of ["bernay", "atelier"]) {
    await app(restaurant, async (tx) => {
      await tx.query("SELECT set_config('donuts.security_import','on',true)");
      await tx.query(
        "INSERT INTO ops_security_events(event_id,occurred_at,severity,event_type,module,action,restaurant_id,message) VALUES($1,$2::date+interval '12 hours',2,'test.tenant','security','Archive isolée',$3,$4)",
        [`archive-${restaurant}`, day, restaurant, `Événement ${restaurant}`],
      );
    });
    await app(restaurant, (tx) =>
      archiveDay(nestedDatabase(tx), day, { archiveDir: null }),
    );
  }
  const archives = await db.query<{
    restaurant_id: string;
    payload: { restaurant_id: string; message: string }[];
  }>(
    "SELECT restaurant_id,payload FROM ops_security_archives WHERE day=$1 ORDER BY restaurant_id",
    [day],
  );
  assert.deepEqual(
    archives.rows.map((row) => row.restaurant_id),
    ["atelier", "bernay"],
  );
  for (const row of archives.rows) {
    assert.equal(row.payload.length, 1);
    assert.equal(row.payload[0].restaurant_id, row.restaurant_id);
    assert.equal(row.payload[0].message, `Événement ${row.restaurant_id}`);
  }
});
