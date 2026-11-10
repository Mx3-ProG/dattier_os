import { spawn } from "node:child_process";
import type { Client } from "pg";
import { commerce } from "../../src/features/commerce/service";
import { seed } from "../../src/lib/database/seed";
import type { DB } from "../../src/lib/database/types";
import { SESSION_SECRET, WEBHOOK_SECRET } from "./http";

/** Données réelles de démonstration pour les parcours publics, posées une seule fois. */
async function prepare(migrator: Client) {
  const tx: DB = {
    query: async <T>(sql: string, params: unknown[] = []) => {
      const result = await migrator.query(sql, params as never[]);
      return { rows: result.rows as T[], affectedRows: result.rowCount ?? 0 };
    },
    exec: async (sql: string) => {
      await migrator.query(sql);
    },
  } as DB;
  const found = await migrator.query(
    "SELECT 1 FROM restaurants WHERE id='bernay'",
  );
  if (found.rowCount) return;
  await migrator.query("BEGIN");
  try {
    await seed(tx);
    await commerce("bernay").updateSettings(
      tx,
      { id: "nadia", name: "Nadia", role: "OWNER" },
      {
        open: true,
        prepMinutes: 5,
        interval: 5,
        capacity: 50,
        hours: Array.from({ length: 7 }, (_, day) => ({
          day,
          open: "00:00",
          close: "23:59",
        })),
        categories: ["Entrées", "Plats", "Desserts", "Boissons"],
        address: "Test",
        phone: "",
        logo: "",
      },
    );
    await migrator.query("COMMIT");
  } catch (error) {
    await migrator.query("ROLLBACK");
    throw error;
  }
}

/** Lance le build de production avec le login web réel. Nécessite `next build`. */
export async function startApp(migrator: Client, webUrl: string) {
  await prepare(migrator);
  const port = Number(process.env.ISOLATION_PORT || 3457);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    "npx",
    ["next", "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      env: {
        ...process.env,
        ATACUISINE_DEMO: "false",
        NODE_ENV: "production",
        DATABASE_URL: webUrl,
        APP_URL: url,
        SESSION_SECRET,
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        OIDC_ISSUER: "http://127.0.0.1:9/realms/test",
        OIDC_ALLOW_HTTP: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      /* Déjà arrêté. */
    }
  };
  for (let i = 0; i < 60; i++) {
    try {
      const health = await fetch(`${url}/api/health`);
      if (health.ok) return { url, stop };
    } catch {
      /* Pas encore démarré. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop();
  throw new Error(`L'application ne démarre pas :\n${output.slice(-2000)}`);
}
