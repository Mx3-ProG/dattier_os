import type { PGlite } from "@electric-sql/pglite";
import type { DB, Database } from "./types";
import { databaseContext } from "./context";
/** Context exists in the local SQL engine too; never share session-level tenant state. */
export class DemoDatabase implements Database {
  constructor(private db: PGlite) {}
  transaction<T>(fn: (tx: DB) => Promise<T>) {
    return this.db.transaction(async (tx) => {
      const c = databaseContext.getStore() || {};
      await tx.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true),set_config('app.customer_id',$4,true)",
        [
          c.userId || "",
          c.restaurantId || "",
          c.public ? "true" : "false",
          c.customerId || "",
        ],
      );
      return fn(tx);
    });
  }
  query<T>(sql: string, params: unknown[] = []) {
    return this.transaction((tx) => tx.query<T>(sql, params));
  }
  exec(sql: string) {
    return this.transaction((tx) => tx.exec(sql));
  }
  close() {
    return this.db.close();
  }
}
