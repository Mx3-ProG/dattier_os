import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "./src/infrastructure/database/migrate.ts";
const db = new PGlite(".data/atacuisine-demo");
await db.transaction(async (tx) => {
  await applyMigrations(tx);
});
console.log("migrations applied");
const r = await db.query("SELECT version FROM schema_versions WHERE version >= 150 ORDER BY version");
console.log("versions:", r.rows.map(x=>x.version));
const p = await db.query("SELECT id FROM addon_products WHERE id IN ('site-commerce','site-content','site-engagement')");
console.log("products:", p.rows.map(x=>x.id));
await db.close();
EOF
node --import tsx run-mig.mjs; rm -f run-mig.mjs