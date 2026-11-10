import { randomUUID } from "node:crypto";
import type { Client } from "pg";

/**
 * Jeu de données générique pour le test d'isolation : une ligne réelle par table
 * tenant et par établissement, dérivée du catalogue. Une nouvelle table est donc
 * couverte sans modifier ce fichier, sauf si elle est sans portée (voir GLOBAL_TABLES).
 */

export type TenantKey = "a1" | "a2" | "b1";
export type Row = Record<string, unknown>;
export type Column = {
  name: string;
  type: string;
  notNull: boolean;
  hasDefault: boolean;
  generated: boolean;
};
export type Fk = {
  columns: string[];
  parent: string;
  parentColumns: string[];
};
export type Table = {
  name: string;
  columns: Column[];
  primaryKey: string[];
  fks: Fk[];
  checks: string[];
};
export type World = {
  run: string;
  org: { a: string; b: string };
  restaurant: Record<TenantKey, string>;
  profile: {
    ownerA: string;
    employeeA1: string;
    memberA: string;
    ownerB: string;
    customerB: string;
  };
  tables: Map<string, Table>;
  rows: Map<string, Partial<Record<TenantKey, Row>>>;
  skipped: Map<string, string>;
};

/** Tables sans donnée propre à un tenant, ou portées par le profil : hors matrice. */
export const GLOBAL_TABLES = new Map<string, string>([
  ["schema_versions", "Numéro de version du schéma."],
  ["profiles", "Identité globale, vérifiée par les scénarios dédiés."],
  ["profile_appearance", "Préférences personnelles, portée profil."],
  ["sessions", "Sessions de démonstration, portée profil."],
  ["platform_admins", "Administrateurs de la plateforme."],
  ["rate_limits", "Compteurs hachés, accessibles par fonction uniquement."],
  ["addon_categories", "Catalogue commun à tous les clients."],
  ["addon_products", "Catalogue commun à tous les clients."],
  ["addon_catalog_events", "Journal du catalogue commun, sans accès applicatif."],
  ["analytics_salts", "Sel quotidien de mesure d’audience, sans aucun accès applicatif."],
]);
/** Racines et appartenances, créées explicitement ci-dessous. */
const MANUAL_TABLES = new Set([
  "organizations",
  "restaurants",
  "memberships",
  "organization_memberships",
]);

export async function readCatalog(db: Client) {
  const tables = new Map<string, Table>();
  const names = await db.query<{ relname: string }>(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1",
  );
  for (const { relname } of names.rows) {
    const columns = await db.query<{
      attname: string;
      type: string;
      attnotnull: boolean;
      has_default: boolean;
      generated: boolean;
    }>(
      `SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
              a.atthasdef AS has_default,(a.attgenerated<>'' OR a.attidentity<>'') AS generated
         FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
      [relname],
    );
    const constraints = await db.query<{
      contype: string;
      columns: string[];
      parent: string | null;
      parent_columns: string[] | null;
      def: string;
    }>(
      `SELECT c.contype::text AS contype,
              (SELECT array_agg(a.attname::text ORDER BY k.i) FROM unnest(c.conkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n) AS columns,
              c.confrelid::regclass::text AS parent,
              (SELECT array_agg(a.attname::text ORDER BY k.i) FROM unnest(c.confkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n) AS parent_columns,
              pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c WHERE c.conrelid=$1::regclass`,
      [relname],
    );
    tables.set(relname, {
      name: relname,
      columns: columns.rows.map((c) => ({
        name: c.attname,
        type: c.type,
        notNull: c.attnotnull,
        hasDefault: c.has_default,
        generated: c.generated,
      })),
      primaryKey:
        constraints.rows.find((c) => c.contype === "p")?.columns ?? [],
      fks: constraints.rows
        .filter((c) => c.contype === "f")
        .map((c) => ({
          columns: c.columns,
          parent: c.parent!,
          parentColumns: c.parent_columns!,
        })),
      checks: constraints.rows.filter((c) => c.contype === "c").map((c) => c.def),
    });
  }
  return tables;
}

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/** Valeur imposée par une contrainte CHECK simple : IN (...), = ANY(ARRAY[...]) ou = '...'. */
function allowedValue(table: Table, column: string) {
  for (const check of table.checks) {
    if (!check.includes(column)) continue;
    const pattern = new RegExp(
      `\\(?${column}\\)?(?:::text)?\\s*(?:=\\s*ANY\\s*\\(+\\s*ARRAY\\[|IN\\s*\\(|=\\s*)'([^']+)'`,
    );
    const match = check.match(pattern);
    if (match) return match[1];
  }
}

// Base de test réutilisable : les valeurs ne doivent pas rentrer en collision entre deux runs.
let counter = Math.floor(Math.random() * 15000);
function fallback(world: Pick<World, "run">, table: Table, column: Column) {
  const allowed = allowedValue(table, column.name);
  if (allowed !== undefined) return allowed;
  const n = ++counter;
  const type = column.type;
  if (type.endsWith("[]")) return "{}";
  if (/^(text|character)/.test(type))
    return `iso-${world.run}-${table.name}-${column.name}-${n}`.slice(
      0,
      /\((\d+)\)/.test(type) ? Number(type.match(/\((\d+)\)/)![1]) : 200,
    );
  if (/^(integer|bigint|smallint)/.test(type)) return 1000 + n;
  if (/^(numeric|double|real)/.test(type)) return 1;
  if (type === "boolean") return false;
  if (type === "date") return "2026-01-15";
  if (type.startsWith("timestamp")) return "2026-01-15T12:00:00Z";
  if (type === "time without time zone") return "12:00:00";
  if (type === "interval") return "1 hour";
  if (type === "jsonb" || type === "json") return "{}";
  if (type === "uuid") return randomUUID();
  if (type === "bytea") return "\\x00";
  if (type === "inet") return "127.0.0.1";
  return `iso-${world.run}-${n}`;
}

/** Corrections pour les contraintes que l'analyse générique ne sait pas satisfaire. */
const overrides: Record<string, (tenant: TenantKey, n: number) => Row> = {
  customer_badges: (_, n) => ({ badge: `badge-${n}` }),
  customer_referral_codes: (_, n) => ({
    code: `ISO${String(n % 100000).padStart(5, "0")}`,
  }),
  customer_referrals: (_, n) => ({
    referred_customer_id: `iso-referred-${randomUUID()}-${n}`,
  }),
  dining_tables: () => ({ capacity: 4 }),
  fin_accounts: (_, n) => ({ code: `7${String(n).padStart(6, "0")}` }),
  fin_company: () => ({ siren: "123456789" }),
  fin_entry_lines: () => ({ debit: 1, credit: 0 }),
  fin_invoice_lines: () => ({ rate_bp: 1000 }),
  fin_invoices: () => ({ kind: "invoice" }),
  fin_tax_rates: () => ({ rate_bp: 1000 }),
  hr_contracts: () => ({ weekly_minutes: 2100 }),
  flash_promotions: () => ({
    value: 10,
    starts_at: "2026-01-15T12:00:00Z",
    ends_at: "2026-01-15T14:00:00Z",
  }),
  hr_payroll_periods: () => ({ month: "2026-01" }),
  online_payments: () => ({
    gross: 100,
    commission: 7,
    stripe_fee_estimate: 3,
    net: 90,
  }),
  ops_security_archives: (_, n) => ({
    chain_sha256: n.toString(16).padStart(64, "0"),
    sha256: n.toString(16).padStart(64, "0"),
  }),
  ops_security_events: () => ({ severity: 1 }),
  ops_security_incidents: () => ({ severity: 1 }),
  order_items: () => ({ quantity: 1 }),
  product_reviews: () => ({ rating: 5 }),
  promo_codes: (_, n) => ({ value: 10, code: `ISO${n}` }),
  qr_codes: (_, n) => ({ kind: "table", token: `iso${String(n).padStart(7, "0")}` }),
  reservations: () => ({
    guests: 2,
    starts_at: "2026-01-15T12:00:00Z",
    ends_at: "2026-01-15T14:00:00Z",
  }),
  // Une seule commande ouverte par pack et par organisation : A1 et A2 en partagent une.
  studio_credit_orders: (tenant) => ({
    pack_cents: tenant === "a2" ? 1000 : 500,
  }),
  shifts: () => ({
    starts_at: "2026-01-15T12:00:00Z",
    ends_at: "2026-01-15T14:00:00Z",
  }),
};

export function buildRow(
  world: World,
  table: Table,
  tenant: TenantKey,
  refresh = false,
) {
  const values: Row = {};
  const org = tenant === "b1" ? world.org.b : world.org.a;
  const owner = tenant === "b1" ? world.profile.ownerB : world.profile.ownerA;
  for (const fk of table.fks) {
    fk.columns.forEach((column, index) => {
      if (column === "restaurant_id") return;
      const parentColumn = fk.parentColumns[index];
      if (fk.parent === "profiles") values[column] = owner;
      else if (fk.parent === "restaurants")
        values[column] = world.restaurant[tenant];
      else if (fk.parent === "organizations") values[column] = org;
      else if (fk.parent !== table.name) {
        const parent = world.rows.get(fk.parent)?.[tenant];
        if (parent) values[column] = parent[parentColumn];
      }
    });
  }
  for (const column of table.columns) {
    if (column.generated || column.name in values) continue;
    if (column.name === "restaurant_id")
      values[column.name] = world.restaurant[tenant];
    else if (column.name === "organization_id") values[column.name] = org;
    else if (
      (column.notNull && !column.hasDefault) ||
      (refresh && table.primaryKey.includes(column.name))
    )
      values[column.name] = fallback(world, table, column);
  }
  // Une nouvelle ligne de test ne doit pas réutiliser une clé déjà prise.
  if (refresh)
    for (const key of table.primaryKey) {
      const column = table.columns.find((c) => c.name === key)!;
      const isReference = table.fks.some((fk) => fk.columns.includes(key));
      if (!isReference && !column.generated)
        values[key] = fallback(world, table, column);
    }
  return { ...values, ...overrides[table.name]?.(tenant, ++counter) };
}

export function insertSql(table: Table, values: Row) {
  const columns = Object.keys(values);
  const types = columns.map(
    (name) => table.columns.find((c) => c.name === name)?.type ?? "text",
  );
  return {
    sql: columns.length
      ? `INSERT INTO ${quote(table.name)} AS t(${columns.map(quote).join(",")}) VALUES(${columns
          .map((_, i) => `$${i + 1}::${types[i]}`)
          .join(",")}) RETURNING to_jsonb(t) AS row`
      : `INSERT INTO ${quote(table.name)} AS t DEFAULT VALUES RETURNING to_jsonb(t) AS row`,
    params: columns.map((name) => values[name]),
  };
}

/** Ordre parents d'abord ; les cycles passent par des clés étrangères facultatives. */
function ordered(tables: Map<string, Table>) {
  const seen = new Set<string>();
  const result: Table[] = [];
  const visit = (name: string, stack: Set<string>) => {
    const table = tables.get(name);
    if (!table || seen.has(name) || stack.has(name)) return;
    stack.add(name);
    for (const fk of table.fks) visit(fk.parent, stack);
    stack.delete(name);
    seen.add(name);
    result.push(table);
  };
  for (const name of tables.keys()) visit(name, new Set());
  return result;
}

/** Une table est tenant si elle porte le tenant ou dépend d'une table qui le porte. */
export function tenantTables(tables: Map<string, Table>) {
  const scoped = new Set<string>();
  const hasScope = (table: Table) =>
    table.columns.some((c) =>
      ["restaurant_id", "organization_id"].includes(c.name),
    ) || table.fks.some((fk) => scoped.has(fk.parent));
  let changed = true;
  while (changed) {
    changed = false;
    for (const table of tables.values())
      if (
        !scoped.has(table.name) &&
        !GLOBAL_TABLES.has(table.name) &&
        !MANUAL_TABLES.has(table.name) &&
        hasScope(table)
      ) {
        scoped.add(table.name);
        changed = true;
      }
  }
  return scoped;
}

/** Vrai si la ligne ne peut être rattachée qu'à l'organisation, pas à un établissement. */
export function organizationScoped(tables: Map<string, Table>, name: string) {
  const seen = new Set<string>();
  const reaches = (table: string): boolean => {
    if (seen.has(table)) return false;
    seen.add(table);
    const entry = tables.get(table);
    if (!entry) return false;
    if (entry.columns.some((c) => c.name === "restaurant_id")) return true;
    return entry.fks.some(
      (fk) => fk.parent === "restaurants" || reaches(fk.parent),
    );
  };
  return !reaches(name);
}

export async function seedWorld(db: Client): Promise<World> {
  const run = randomUUID().slice(0, 8);
  const id = (name: string) => `iso-${run}-${name}`;
  const tables = await readCatalog(db);
  const world: World = {
    run,
    org: { a: id("org-a"), b: id("org-b") },
    restaurant: { a1: id("a1"), a2: id("a2"), b1: id("b1") },
    profile: {
      ownerA: id("owner-a"),
      employeeA1: id("employee-a1"),
      memberA: id("member-a"),
      ownerB: id("owner-b"),
      customerB: id("customer-b"),
    },
    tables,
    rows: new Map(),
    skipped: new Map(),
  };
  await db.query("BEGIN");
  // Superutilisateur de test : triggers et FK coupés le temps de poser les lignes.
  await db.query("SET LOCAL session_replication_role=replica");
  for (const [key, name] of Object.entries(world.profile))
    await db.query(
      "INSERT INTO profiles(id,name,role,email) VALUES($1,$2,'WAITER',$3)",
      [name, key, `${name}@example.test`],
    );
  for (const org of Object.values(world.org)) {
    await db.query("INSERT INTO organizations(id,name) VALUES($1,$1)", [org]);
    await db.query(
      "INSERT INTO app.organization_plans(organization_id,plan,seats) VALUES($1,99,10) ON CONFLICT DO NOTHING",
      [org],
    );
  }
  for (const key of ["a1", "a2", "b1"] as TenantKey[])
    await db.query(
      "INSERT INTO restaurants(id,name,organization_id) VALUES($1,$1,$2)",
      [world.restaurant[key], key === "b1" ? world.org.b : world.org.a],
    );
  const memberships: [string, string, string][] = [
    [world.profile.ownerA, world.restaurant.a1, "OWNER"],
    [world.profile.ownerA, world.restaurant.a2, "OWNER"],
    [world.profile.employeeA1, world.restaurant.a1, "WAITER"],
    [world.profile.ownerB, world.restaurant.b1, "OWNER"],
  ];
  for (const m of memberships)
    await db.query("INSERT INTO memberships VALUES($1,$2,$3)", m);
  const orgRoles: [string, string, string][] = [
    [world.org.a, world.profile.ownerA, "OWNER"],
    [world.org.a, world.profile.employeeA1, "MEMBER"],
    [world.org.a, world.profile.memberA, "MEMBER"],
    [world.org.b, world.profile.ownerB, "OWNER"],
  ];
  for (const m of orgRoles)
    await db.query("INSERT INTO organization_memberships VALUES($1,$2,$3)", m);

  const scoped = tenantTables(tables);
  for (const table of ordered(tables)) {
    if (!scoped.has(table.name)) continue;
    const seeded: Partial<Record<TenantKey, Row>> = {};
    for (const tenant of ["a1", "a2", "b1"] as TenantKey[]) {
      const { sql, params } = insertSql(table, buildRow(world, table, tenant));
      await db.query("SAVEPOINT seed_row");
      try {
        const result = await db.query<{ row: Row }>(sql, params);
        seeded[tenant] = result.rows[0].row;
        await db.query("RELEASE SAVEPOINT seed_row");
      } catch (error) {
        await db.query("ROLLBACK TO SAVEPOINT seed_row");
        // Ligne d'organisation unique : A1 et A2 partagent la même.
        if (
          tenant === "a2" &&
          seeded.a1 &&
          (error as { code?: string }).code === "23505" &&
          organizationScoped(tables, table.name)
        ) {
          seeded.a2 = seeded.a1;
          continue;
        }
        world.skipped.set(
          table.name,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    world.rows.set(table.name, seeded);
  }
  await db.query("COMMIT");
  return world;
}
