import { PostgresDatabase } from "../src/lib/database/postgres";
import { withDatabaseContext } from "../src/lib/database/context";
import { createOrder, orderSchema } from "../src/features/orders/service";
import { randomUUID } from "node:crypto";
const url = process.env.MIGRATION_DATABASE_URL;
if (!url || new URL(url).pathname !== "/dattier_load_test")
  throw new Error("Utiliser uniquement la base jetable dattier_load_test.");
const db = new PostgresDatabase(url),
  count = Number(process.env.RESTAURANTS || 500),
  concurrency = 20;
if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error("Nombre invalide.");
try {
  for (let n = 0; n < count; n++) {
    const u = `load-user-${n}`,
      r = `load-restaurant-${n}`;
    await withDatabaseContext({ userId: u }, () =>
      db.transaction(async (tx) => {
        await tx.query("SELECT app.ensure_profile($1,$2,$3)", [
          u,
          u,
          `${u}@example.test`,
        ]);
        await tx.query("SELECT app.bootstrap_organization($1,$2,$3,$4)", [
          `load-org-${n}`,
          `Groupe ${n}`,
          r,
          `Restaurant ${n}`,
        ]);
        await tx.query(
          "INSERT INTO ingredients(id,restaurant_id,name,unit,threshold,cost) VALUES($1,$2,'Ingrédient','g',0,0.01)",
          [r + "-ingredient", r],
        );
        await tx.query(
          "INSERT INTO stock_lots(id,ingredient_id,quantity,expires_on) VALUES($1,$2,1000000,CURRENT_DATE+7)",
          [r + "-lot", r + "-ingredient"],
        );
        await tx.query(
          "INSERT INTO menu_items(id,restaurant_id,name,category,price,station) VALUES($1,$2,'Plat','Plats',1000,'kitchen')",
          [r + "-menu", r],
        );
        await tx.query("INSERT INTO recipe_ingredients VALUES($1,$2,100)", [
          r + "-menu",
          r + "-ingredient",
        ]);
        await tx.query(
          "INSERT INTO dining_tables(id,restaurant_id,number,capacity) VALUES($1,$2,1,4)",
          [r + "-table", r],
        );
      }),
    );
  }
  const timings: number[] = [],
    errors: string[] = [];
  let index = 0;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < count * 4) {
        const n = index++,
          i = n % count,
          u = `load-user-${i}`,
          r = `load-restaurant-${i}`,
          t = performance.now();
        try {
          await withDatabaseContext({ userId: u, restaurantId: r }, () =>
            db.transaction(async (tx) => {
              await tx.exec("SET LOCAL ROLE dattier_app");
              if (n % 2 === 0) {
                await createOrder(
                  tx,
                  orderSchema.parse({
                    restaurant: r,
                    table: r + "-table",
                    key: randomUUID(),
                    items: [{ menu: r + "-menu", quantity: 1 }],
                  }),
                  { id: u, name: u, role: "OWNER" },
                );
              } else {
                await tx.query(
                  "SELECT id,status FROM orders WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 25",
                  [r],
                );
              }
            }),
          );
          timings.push(performance.now() - t);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Erreur");
        }
      }
    }),
  );
  timings.sort((a, b) => a - b);
  const seconds = (performance.now() - start) / 1000;
  console.log(
    JSON.stringify(
      {
        restaurants: count,
        operations: count * 4,
        concurrency,
        seconds,
        opsPerSecond: timings.length / seconds,
        p50Ms: timings[Math.floor(timings.length * 0.5)],
        p95Ms: timings[Math.floor(timings.length * 0.95)],
        errors: errors.length,
        firstErrors: errors.slice(0, 3),
        scope:
          "Scénario SQL synthétique ; ne valide pas 500 restaurants réels ni HTTP/OIDC/S3.",
      },
      null,
      2,
    ),
  );
  if (errors.length) process.exitCode = 1;
} finally {
  await db.close();
}
