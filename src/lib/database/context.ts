import { AsyncLocalStorage } from "node:async_hooks";
export type DatabaseContext = {
  userId?: string;
  restaurantId?: string;
  public?: boolean;
  customerId?: string;
};
// Next route bundles share the database singleton; they must share its context too.
const runtime = globalThis as typeof globalThis & {
  atacuisineDatabaseContext?: AsyncLocalStorage<DatabaseContext>;
};
export const databaseContext = (runtime.atacuisineDatabaseContext ??=
  new AsyncLocalStorage<DatabaseContext>());
export const withDatabaseContext = <T>(
  context: DatabaseContext,
  fn: () => Promise<T>,
) => databaseContext.run(context, fn);
