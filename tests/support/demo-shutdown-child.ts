// Processus enfant de tests/demo-shutdown.test.ts : ouvre une base PGlite, écrit, puis
// imite Next.js qui appelle process.exit dès SIGTERM.
import { PGlite } from "@electric-sql/pglite";
import { closeOnShutdown } from "../../src/lib/database/demo-shutdown";

const [dir, mode] = process.argv.slice(2);
const db = new PGlite(dir);
if (mode === "graceful") closeOnShutdown(async () => {
  await db.close();
  console.log("CLOSED");
});
process.on("SIGTERM", () => process.exit(143));
await db.exec("CREATE TABLE IF NOT EXISTS events(id serial PRIMARY KEY, payload text)");
for (let batch = 0; batch < 20; batch++)
  await db.query("INSERT INTO events(payload) SELECT repeat('x',200) FROM generate_series(1,500)");
console.log("READY");
setInterval(() => {}, 1000);
