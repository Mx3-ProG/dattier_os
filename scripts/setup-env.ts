import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const example = await readFile(".env.production.example", "utf8");
const secrets = [
  "POSTGRES_PASSWORD",
  "APP_DB_PASSWORD",
  "WORKER_DB_PASSWORD",
  "IDENTITY_DB_PASSWORD",
  "KEYCLOAK_ADMIN_PASSWORD",
  "SESSION_SECRET",
  "INTEGRATION_ENCRYPTION_KEY",
  "GARAGE_RPC_SECRET",
  "AWS_SECRET_ACCESS_KEY",
];
let content = example;
for (const key of secrets)
  content = content.replace(
    `${key}=\n`,
    `${key}=${randomBytes(32).toString("hex")}\n`,
  );
content = content.replace(
  "AWS_ACCESS_KEY_ID=\n",
  `AWS_ACCESS_KEY_ID=GK${randomBytes(16).toString("hex")}\n`,
);
await writeFile(".env.production", content, { flag: "wx", mode: 0o600 });
console.log(
  "Configuration privée créée. Renseignez APP_URL, IDENTITY_URL et SOURCE_URL avant le démarrage.",
);
