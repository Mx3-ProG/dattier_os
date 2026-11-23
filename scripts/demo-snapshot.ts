/* Fige la base de démo locale dans database/demo-snapshot/studio-demo.tar.gz,
   l'instantané que la démo publique (ATACUISINE_PUBLIC_DEMO=true) charge en mémoire.

   npm run demo:snapshot -- [dossier de la base, défaut .data/atacuisine-demo]

   La base source n'est jamais ouverte : on travaille sur une copie temporaire,
   ce qui reste sûr même si `next dev` la tient ouverte. */
import { PGlite } from "@electric-sql/pglite";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEMO_SNAPSHOT } from "../src/infrastructure/database/db";

// Traces de connexion et journaux techniques : rien à publier.
const SCRUB = [
  "sessions",
  "customer_sessions",
  "customer_access_tokens",
  "ops_security_events",
  "security_events",
  "rate_limits",
];

const source = path.resolve(process.argv[2] || ".data/atacuisine-demo");
const work = await mkdtemp(path.join(tmpdir(), "studio-demo-snapshot-"));
const copy = path.join(work, "db");
try {
  await cp(source, copy, { recursive: true });
  await rm(path.join(copy, "postmaster.pid"), { force: true });
  const db = new PGlite(copy);
  // Le journal de sécurité refuse les suppressions (déclencheur) : on le contourne sur la copie seulement.
  await db.exec("SET session_replication_role = replica");
  for (const table of SCRUB) {
    const { rows } = await db.query<{ ok: boolean }>(
      "SELECT to_regclass($1) IS NOT NULL AS ok",
      [`public.${table}`],
    );
    if (rows[0]?.ok) await db.exec(`DELETE FROM public.${table}`);
  }
  await db.exec("RESET session_replication_role");
  await db.exec("VACUUM");
  const profiles = await db.query<{ name: string }>(
    "SELECT name FROM profiles WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.profile_id=profiles.id) ORDER BY name",
  );
  const blob = await db.dumpDataDir("gzip");
  await db.close();
  const target = path.resolve(DEMO_SNAPSHOT);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await blob.arrayBuffer()));
  console.log(
    `Instantané écrit : ${DEMO_SNAPSHOT} (${(blob.size / 1e6).toFixed(1)} Mo)\nProfils : ${profiles.rows.map((p) => p.name).join(", ")}`,
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
