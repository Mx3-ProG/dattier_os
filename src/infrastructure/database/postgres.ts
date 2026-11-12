import { Pool, types, type PoolClient } from "pg";
import type { Database, DB } from "./types";
import { databaseContext } from "./context";
// Match PGlite's JSON-compatible timestamp/date results.
for (const oid of [1082, 1114, 1184])
  types.setTypeParser(oid, (value) =>
    oid === 1082 ? value : new Date(value).toISOString(),
  );
types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error("Entier hors limites.");
  return n;
});
class Connection implements DB {
  readonly isTransaction = true;
  constructor(private client: PoolClient) {}
  async query<T>(sql: string, params: unknown[] = []) {
    const result = await this.client.query(sql, params);
    return { rows: result.rows as T[], affectedRows: result.rowCount ?? 0 };
  }
  async exec(sql: string) {
    await this.client.query(sql);
  }
}
export class PostgresDatabase implements Database {
  readonly pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_SIZE || 10),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
  }
  async transaction<T>(fn: (tx: DB) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='15s'");
      const c = databaseContext.getStore() || {};
      await client.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true),set_config('app.customer_id',$4,true)",
        [
          c.userId || "",
          c.restaurantId || "",
          c.public ? "true" : "false",
          c.customerId || "",
        ],
      );
      const result = await fn(new Connection(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  query<T>(sql: string, params: unknown[] = []) {
    return this.transaction((tx) => tx.query<T>(sql, params));
  }
  exec(sql: string) {
    return this.transaction((tx) => tx.exec(sql));
  }
  async close() {
    await this.pool.end();
  }
}
