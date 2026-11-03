import { randomUUID } from "node:crypto";
import type { DB, Database } from "./types";
/** Adapts an already-authorized transaction for services with nested atomic steps. */
export function nestedDatabase(tx: DB): Database & { isTransaction: true } {
  const db = {
    isTransaction: true as const,
    query: <T>(sql: string, params: unknown[] = []) => tx.query<T>(sql, params),
    exec: (sql: string) => tx.exec(sql),
    async close() {},
    async transaction<T>(fn: (db: DB) => Promise<T>) {
      const savepoint = "nested_" + randomUUID().replaceAll("-", "");
      await tx.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = await fn(db);
        await tx.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (e) {
        await tx.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await tx.exec(`RELEASE SAVEPOINT ${savepoint}`);
        throw e;
      }
    },
  };
  return db;
}
