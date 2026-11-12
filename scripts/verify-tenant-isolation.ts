import { Client, Pool } from "pg";
import {
  buildRow,
  GLOBAL_TABLES,
  insertSql,
  organizationScoped,
  seedWorld,
  tenantTables,
  type Row,
  type Table,
  type TenantKey,
  type World,
} from "./isolation/seed";
import {
  PUBLIC_INSERT_ONLY_TABLES,
  PUBLIC_ROOT_TABLES,
  PUBLIC_TABLES,
} from "../src/infrastructure/database/public-tables";

/**
 * Deux clients, deux organisations : aucune donnée ne doit passer de l'un à l'autre.
 * Se connecte avec les vrais logins web et worker, jamais via SET LOCAL ROLE.
 * Voir docs/platform/TENANT_ISOLATION.md.
 */
const migratorUrl = process.env.MIGRATION_DATABASE_URL;
const webUrl = process.env.ISOLATION_WEB_URL;
const workerUrl = process.env.ISOLATION_WORKER_URL;
if (!migratorUrl || !webUrl || !workerUrl)
  throw new Error(
    "MIGRATION_DATABASE_URL, ISOLATION_WEB_URL et ISOLATION_WORKER_URL requis.",
  );
if (!["127.0.0.1", "localhost"].includes(new URL(migratorUrl).hostname))
  throw new Error("Base locale de vérification requise.");
if (process.env.CONFIRM_ISOLATED_DATABASE !== "true")
  throw new Error("CONFIRM_ISOLATED_DATABASE=true requis.");

const failures = new Map<string, string[]>();
let checks = 0;
function fail(section: string, detail: string) {
  failures.set(section, [...(failures.get(section) ?? []), detail]);
}
function check(section: string, ok: boolean, detail: string) {
  checks++;
  if (!ok) fail(section, detail);
}

type Context = {
  userId?: string;
  restaurantId?: string;
  public?: boolean;
  customerId?: string;
};
const web = new Pool({ connectionString: webUrl, max: 4 });
const worker = new Pool({ connectionString: workerUrl, max: 2 });

/** Exécute dans le même contexte que l'application, puis annule toujours. */
async function attempt<T>(
  pool: Pool,
  context: Context,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<{ value?: T; error?: string; code?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true),set_config('app.customer_id',$4,true)",
      [
        context.userId || "",
        context.restaurantId || "",
        context.public ? "true" : "false",
        context.customerId || "",
      ],
    );
    return { value: await fn(client) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string }).code,
    };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
function whereRow(table: Table, row: Row) {
  const keys = table.primaryKey.length
    ? table.primaryKey
    : Object.keys(row).filter((key) => row[key] !== null).slice(0, 4);
  return {
    sql: keys
      .map((key, i) => `(to_jsonb(t)->>'${key}')=$${i + 1}`)
      .join(" AND "),
    params: keys.map((key) =>
      typeof row[key] === "string" ? row[key] : JSON.stringify(row[key]),
    ),
  };
}

async function catalogChecks(db: Client, world: World) {
  const section = "Catalogue et privilèges";
  const scoped = tenantTables(world.tables);
  const rls = await db.query<{
    relname: string;
    relrowsecurity: boolean;
    policies: number;
  }>(
    `SELECT c.relname,c.relrowsecurity,(SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid AND p.polpermissive) AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`,
  );
  const definerOnly = new Set(["fin_counters"]);
  for (const table of rls.rows) {
    if (!scoped.has(table.relname)) continue;
    check(
      section,
      table.relrowsecurity,
      `${table.relname} : RLS désactivée`,
    );
    if (!definerOnly.has(table.relname))
      check(
        section,
        table.policies > 0,
        `${table.relname} : aucune politique`,
      );
  }
  for (const name of world.tables.keys())
    check(
      section,
      scoped.has(name) ||
        GLOBAL_TABLES.has(name) ||
        ["organizations", "restaurants", "memberships", "organization_memberships"].includes(name),
      `${name} : table sans portée connue, à classer`,
    );
  for (const name of [...PUBLIC_TABLES, ...PUBLIC_INSERT_ONLY_TABLES])
    check(
      section,
      world.tables.has(name),
      `${name} : figure dans la liste publique mais n'existe pas`,
    );

  // La liste du code et les politiques de la base doivent dire la même chose.
  const restrictive = await db.query<{ relname: string; policies: string[] }>(
    `SELECT c.relname,coalesce(array_agg(p.polname::text) FILTER (WHERE NOT p.polpermissive),'{}') AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_policy p ON p.polrelid=c.oid
      WHERE n.nspname='public' AND c.relkind='r' GROUP BY c.relname`,
  );
  for (const { relname, policies } of restrictive.rows) {
    if (PUBLIC_ROOT_TABLES.has(relname)) continue;
    if (PUBLIC_TABLES.has(relname))
      check(section, !policies.length, `${relname} : publique, mais restreinte en base`);
    else if (PUBLIC_INSERT_ONLY_TABLES.has(relname))
      check(section, policies.length === 3, `${relname} : lecture publique non bloquée`);
    else
      check(section, policies.includes("public_denied"), `${relname} : ouverte au canal public`);
  }

  // Toute clé étrangère entre tables tenant doit rester dans le même établissement.
  const unguarded = await db.query<{ child: string; col: string; parent: string }>(
    `SELECT c.conrelid::regclass::text AS child,a.attname::text AS col,c.confrelid::regclass::text AS parent
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      WHERE c.contype='f' AND array_length(c.conkey,1)=1 AND c.connamespace='public'::regnamespace
        AND c.confrelid NOT IN ('restaurants'::regclass,'profiles'::regclass,'organizations'::regclass)
        AND EXISTS(SELECT 1 FROM pg_attribute x WHERE x.attrelid=c.conrelid AND x.attname='restaurant_id' AND NOT x.attisdropped)
        AND EXISTS(SELECT 1 FROM pg_attribute x WHERE x.attrelid=c.confrelid AND x.attname='restaurant_id' AND NOT x.attisdropped)
        AND NOT EXISTS(SELECT 1 FROM pg_trigger g WHERE g.tgrelid=c.conrelid AND NOT g.tgisinternal
              AND (pg_get_triggerdef(g.oid) ILIKE format('%%guard_links%%%L%%',a.attname)
                OR g.tgname='tenant_fk_' || a.attname))`,
  );
  for (const fk of unguarded.rows)
    check(section, false, `${fk.child}.${fk.col} → ${fk.parent} : lien inter-tenant non gardé`);

  // Sans droit explicite, une nouvelle table casserait l'application sans rien dire.
  const ungranted = await db.query<{ relname: string }>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN ('schema_versions','fin_counters','addon_catalog_events')
        AND NOT has_table_privilege('atacuisine_app',c.oid,'SELECT')`,
  );
  for (const { relname } of ungranted.rows)
    check(section, false, `${relname} : aucun droit pour l'application`);

  const roles = await db.query<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(
    "SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('atacuisine_web','atacuisine_jobs','atacuisine_app','atacuisine_worker')",
  );
  for (const role of roles.rows)
    check(
      section,
      !role.rolsuper && !role.rolbypassrls,
      `${role.rolname} contourne la RLS`,
    );
  const member = await db.query<{ can: boolean }>(
    "SELECT pg_has_role('atacuisine_web','atacuisine_worker','MEMBER') AS can",
  );
  check(
    section,
    !member.rows[0].can,
    "atacuisine_web peut endosser le rôle worker",
  );
  const owning = await db.query<{ relname: string }>(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (pg_has_role('atacuisine_web',c.relowner,'MEMBER') OR pg_has_role('atacuisine_jobs',c.relowner,'MEMBER'))",
  );
  check(
    section,
    !owning.rows.length,
    `Tables possédées par un rôle applicatif : ${owning.rows.map((r) => r.relname).join(", ")}`,
  );

  // Fonctions sans contrôle d'accès interne : le web ne doit pas pouvoir les appeler.
  const forbidden = [
    "app.fin_insert_entry(text,text,text,date,text,text,jsonb,text)",
    "app.queue_seo_audit(text,text)",
    "app.configure_organization_plan(text,integer,integer,text[])",
    "app.ensure_referral_code(text)",
    "app.paying_referrals(text)",
    "app.refresh_referrer(text)",
    "app.ai_credit(text,integer,text,text,bigint)",
  ];
  const claim = await db.query<{ signature: string }>(
    "SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('claim_jobs','renew_job_lease','purge_jobs')",
  );
  forbidden.push(...claim.rows.map((r) => r.signature));
  for (const signature of forbidden) {
    const granted = await db.query<{ can: boolean }>(
      "SELECT has_function_privilege('atacuisine_web',$1,'EXECUTE') AS can",
      [signature],
    );
    check(
      section,
      !granted.rows[0].can,
      `atacuisine_web peut exécuter ${signature}`,
    );
  }
  // Droits resserrés volontairement par les migrations.
  const narrowed: [string, string][] = [
    ["customer_messages", "UPDATE"],
    ["customer_messages", "DELETE"],
    ["fin_entries", "UPDATE"],
    ["fin_entries", "DELETE"],
    ["loyalty_wallets", "UPDATE"],
    ["fin_counters", "SELECT"],
  ];
  for (const [table, privilege] of narrowed) {
    const granted = await db.query<{ can: boolean }>(
      "SELECT has_table_privilege('atacuisine_web',$1,$2) AS can",
      [table, privilege],
    );
    check(
      section,
      !granted.rows[0].can,
      `atacuisine_web a ${privilege} sur ${table}`,
    );
  }
}

type Scenario = {
  name: string;
  pool: Pool;
  context: Context;
  target: TenantKey;
  /** Limite une frontière aux lignes d'établissement : même organisation, pas la ligne org. */
  sameOrganization?: boolean;
  /** Mode public sur son propre restaurant : seules les tables publiques restent ouvertes. */
  onlyPrivate?: boolean;
  /** Propriétaire des deux établissements : voir ORGANIZATION_ADMIN_TABLES. */
  ownerOfBoth?: boolean;
};
/** Gérées au niveau de l'organisation : son propriétaire y accède depuis n'importe quel établissement. */
const ORGANIZATION_ADMIN_TABLES = new Set([
  "invitations",
  "support_grants",
  "addon_subscriptions",
  "studio_credit_ledger",
]);

function scenarios(world: World): Scenario[] {
  const r = world.restaurant,
    p = world.profile;
  return [
    {
      name: "Client B lit le client A",
      pool: web,
      context: { userId: p.ownerB, restaurantId: r.b1 },
      target: "a1",
    },
    {
      name: "Client B force le contexte du client A",
      pool: web,
      context: { userId: p.ownerB, restaurantId: r.a1 },
      target: "a1",
    },
    {
      name: "Employé de A1 lit A2 depuis A1",
      pool: web,
      context: { userId: p.employeeA1, restaurantId: r.a1 },
      target: "a2",
      sameOrganization: true,
    },
    {
      name: "Employé de A1 force le contexte de A2",
      pool: web,
      context: { userId: p.employeeA1, restaurantId: r.a2 },
      target: "a2",
      sameOrganization: true,
    },
    {
      name: "Propriétaire de A connecté sur A1 lit A2",
      pool: web,
      context: { userId: p.ownerA, restaurantId: r.a1 },
      target: "a2",
      sameOrganization: true,
      ownerOfBoth: true,
    },
    {
      name: "Anonyme sans contexte",
      pool: web,
      context: {},
      target: "a1",
    },
    {
      name: "Visiteur du site de B lit A",
      pool: web,
      context: { restaurantId: r.b1, public: true },
      target: "a1",
    },
    {
      name: "Visiteur du site de A lit les données privées de A",
      pool: web,
      context: { restaurantId: r.a1, public: true },
      target: "a1",
      onlyPrivate: true,
    },
    {
      name: "Compte client de B lit A",
      pool: web,
      context: {
        restaurantId: r.b1,
        public: true,
        customerId: String(world.rows.get("customers")?.b1?.id ?? ""),
      },
      target: "a1",
    },
    {
      name: "Worker sur un job de B lit A",
      pool: worker,
      context: { restaurantId: r.b1, public: true },
      target: "a1",
    },
    {
      name: "Worker sans contexte",
      pool: worker,
      context: {},
      target: "a1",
    },
  ];
}

async function matrix(world: World) {
  const scoped = tenantTables(world.tables);
  for (const scenario of scenarios(world)) {
    const section = `Matrice : ${scenario.name}`;
    for (const name of scoped) {
      const table = world.tables.get(name)!;
      const row = world.rows.get(name)?.[scenario.target];
      if (!row) continue;
      if (
        scenario.sameOrganization &&
        organizationScoped(world.tables, name)
      )
        continue;
      if (scenario.onlyPrivate && PUBLIC_TABLES.has(name)) continue;
      if (scenario.ownerOfBoth && ORGANIZATION_ADMIN_TABLES.has(name)) continue;
      const where = whereRow(table, row);
      const select = await attempt(scenario.pool, scenario.context, (c) =>
        c.query(
          `SELECT 1 FROM ${quote(name)} t WHERE ${where.sql}`,
          where.params,
        ),
      );
      check(
        section,
        !select.value?.rowCount,
        `${name} : SELECT voit la ligne`,
      );
      const firstKey = table.primaryKey[0] ?? table.columns[0].name;
      const update = await attempt(scenario.pool, scenario.context, (c) =>
        c.query(
          `UPDATE ${quote(name)} t SET ${quote(firstKey)}=${quote(firstKey)} WHERE ${where.sql}`,
          where.params,
        ),
      );
      check(section, !update.value?.rowCount, `${name} : UPDATE a modifié la ligne`);
      const removal = await attempt(scenario.pool, scenario.context, (c) =>
        c.query(`DELETE FROM ${quote(name)} t WHERE ${where.sql}`, where.params),
      );
      check(section, !removal.value?.rowCount, `${name} : DELETE a supprimé la ligne`);
      if (scenario.onlyPrivate && PUBLIC_INSERT_ONLY_TABLES.has(name)) continue;
      const fresh = insertSql(
        table,
        buildRow(world, table, scenario.target, true),
      );
      const insert = await attempt(scenario.pool, scenario.context, (c) =>
        c.query(fresh.sql, fresh.params),
      );
      check(section, !insert.value, `${name} : INSERT accepté`);
    }
  }
}

/** Sans contrôle positif, un test qui refuse tout passerait pour un succès. */
async function positiveControl(world: World) {
  const section = "Contrôle positif : le propriétaire voit ses données";
  const scoped = tenantTables(world.tables);
  const definerOnly = new Set(["fin_counters"]);
  for (const name of scoped) {
    const table = world.tables.get(name)!;
    const row = world.rows.get(name)?.a1;
    if (!row || definerOnly.has(name)) continue;
    const where = whereRow(table, row);
    const select = await attempt(
      web,
      { userId: world.profile.ownerA, restaurantId: world.restaurant.a1 },
      (c) =>
        c.query(
          `SELECT 1 FROM ${quote(name)} t WHERE ${where.sql}`,
          where.params,
        ),
    );
    check(
      section,
      !!select.value?.rowCount,
      `${name} : invisible pour son propriétaire (${select.error ?? "0 ligne"})`,
    );
  }
}

/** Scénarios qui demandent des lignes liées, que la matrice générique ne peut pas construire. */
async function regressions(db: Client, world: World) {
  const section = "Régressions";
  const r = world.restaurant,
    p = world.profile;
  // Un compte client connu de A2 seulement n'est visible que du personnel de A2.
  const account = `iso-${world.run}-account-a2`,
    customer = `iso-${world.run}-customer-a2`;
  await db.query(
    "INSERT INTO organization_customers(id,organization_id,subject,email,name) VALUES($1,$2,$1,$3,'Client A2')",
    [account, world.org.a, `${account}@example.test`],
  );
  await db.query(
    "INSERT INTO customers(id,restaurant_id,name,contact,consent,points,account_id) VALUES($1,$2,'Client A2','a2@example.test',false,0,$3)",
    [customer, r.a2, account],
  );
  await db.query("INSERT INTO loyalty_wallets(account_id,points) VALUES($1,5)", [
    account,
  ]);
  const seesAccount = async (context: Context) =>
    (
      await attempt(web, context, (c) =>
        c.query("SELECT 1 FROM organization_customers WHERE id=$1", [account]),
      )
    ).value?.rowCount;
  check(
    section,
    !(await seesAccount({ userId: p.employeeA1, restaurantId: r.a1 })),
    "Un employé de A1 lit un compte client connu de A2 seulement",
  );
  check(
    section,
    !(await seesAccount({ userId: p.memberA, restaurantId: r.a1 })),
    "Un simple membre de l'organisation lit tous les comptes clients",
  );
  check(
    section,
    !!(await seesAccount({ userId: p.ownerA, restaurantId: r.a1 })),
    "Le propriétaire de l'organisation ne voit plus ses comptes clients",
  );
  check(
    section,
    !(await seesAccount({ restaurantId: r.a2, public: true })),
    "Un visiteur anonyme lit un compte client",
  );
  const points = await attempt(
    web,
    { userId: account, restaurantId: r.a2, public: true },
    (c) => c.query("UPDATE loyalty_wallets SET points=99999 WHERE account_id=$1", [account]),
  );
  check(section, !points.value?.rowCount, "Un client modifie son solde de points");

  // L'historique de l'assistant reste propre à chaque établissement.
  await db.query(
    "INSERT INTO app.ai_ledger(organization_id,restaurant_id,profile_id,delta,kind,engine,detail) VALUES($1,$2,$3,-1,'usage','reflex',$4)",
    [world.org.a, r.a2, p.ownerA, `iso-${world.run}-question-a2`],
  );
  const history = await attempt(
    web,
    { userId: p.employeeA1, restaurantId: r.a1 },
    (c) => c.query<{ detail: string }>("SELECT detail FROM app.ai_history($1,50)", [r.a1]),
  );
  check(
    section,
    !history.error &&
      !history.value?.rows.some((row) => row.detail?.includes("question-a2")),
    `Historique IA de A2 visible depuis A1 ${history.error ?? ""}`,
  );

  // Déposer un job pour un autre client est refusé, et le visiteur ne relit pas la file.
  const forgedJob = await attempt(web, { restaurantId: r.b1, public: true }, (c) =>
    c.query("SELECT app.enqueue_job($1,$2,'seo_audit','{}'::jsonb,$1)", [
      `iso-${world.run}-forged`,
      r.a1,
    ]),
  );
  check(section, !!forgedJob.error, "Le site de B dépose un job chez A");
  const ownJob = await attempt(web, { restaurantId: r.b1, public: true }, (c) =>
    c.query("SELECT app.enqueue_job($1,$2,'seo_audit','{}'::jsonb,$1)", [
      `iso-${world.run}-own`,
      r.b1,
    ]),
  );
  check(section, !ownJob.error, `Le site de B ne peut plus déposer ses jobs : ${ownJob.error}`);

  // Une ligne de B ne peut pas pointer vers une ligne de A, même sans la lire.
  const customerA = world.rows.get("customers")?.a1?.id;
  const links: [string, string, unknown[]][] = [
    [
      "reservations.customer_id",
      "INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at,customer_id) VALUES($1,$2,'x','y',2,now(),now()+interval '1 hour',$3)",
      [`iso-${world.run}-link-1`, r.b1, customerA],
    ],
    [
      "customer_messages.customer_id",
      "INSERT INTO customer_messages(id,restaurant_id,customer_id,channel,purpose,recipient,body) VALUES($1,$2,$3,'email','x','x@example.test','x')",
      [`iso-${world.run}-link-2`, r.b1, customerA],
    ],
    [
      "online_payments.order_id",
      "INSERT INTO online_payments(id,restaurant_id,order_id,gross,commission,stripe_fee_estimate,net) VALUES($1,$2,$3,100,7,3,90)",
      [`iso-${world.run}-link-3`, r.b1, world.rows.get("orders")?.a1?.id],
    ],
  ];
  for (const [label, sql, params] of links) {
    const link = await attempt(
      web,
      { userId: p.ownerB, restaurantId: r.b1 },
      (c) => c.query(sql, params),
    );
    check(section, !link.value, `${label} : lien vers une ligne de A accepté`);
    check(
      section,
      !link.value && !!link.error && /hors etablissement|row-level|permission denied/.test(link.error),
      `${label} : refus pour une autre raison (${link.error})`,
    );
  }
}

const migrator = new Client({ connectionString: migratorUrl });
await migrator.connect();
try {
  const world = await seedWorld(migrator);
  const seeded = [...world.rows.values()].filter((r) => r.a1).length;
  console.log(
    `Jeu de données ${world.run} : ${seeded} tables tenant, ${world.skipped.size} non amorcées.`,
  );
  for (const [name, reason] of world.skipped)
    fail("Tables non amorcées (matrice incomplète)", `${name} : ${reason}`);
  await catalogChecks(migrator, world);
  await positiveControl(world);
  await matrix(world);
  await regressions(migrator, world);
  const { workerChecks } = await import("./isolation/workers");
  await workerChecks(world, migrator, worker, workerUrl, check);
  if (process.env.ISOLATION_HTTP === "true") {
    const { startApp } = await import("./isolation/server");
    const { httpChecks } = await import("./isolation/http");
    const app = await startApp(migrator, webUrl);
    console.log(`Vérifications HTTP à partir de ${new Date().toISOString()}.`);
    try {
      await httpChecks(world, migrator, app.url, check);
      if (process.env.S3_BUCKET) {
        const { mediaChecks } = await import("./isolation/media");
        await mediaChecks(world, migrator, app.url, workerUrl, check);
      } else console.log("S3_BUCKET absent : parcours médias non exécuté.");
    } finally {
      app.stop();
    }
  } else
    console.log("ISOLATION_HTTP absent : vérifications HTTP non exécutées.");
} finally {
  await web.end();
  await worker.end();
  await migrator.end();
}

console.log(`\n${checks} vérifications.`);
if (failures.size) {
  let total = 0;
  for (const [section, details] of failures) {
    total += details.length;
    console.log(`\n✗ ${section} (${details.length})`);
    for (const detail of details.slice(0, 200)) console.log(`  - ${detail}`);
  }
  console.log(`\n${total} échecs d'isolation.`);
  process.exitCode = 1;
} else console.log("✓ Aucune fuite détectée sur les chemins testés.");
