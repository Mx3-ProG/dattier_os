import { PostgresDatabase } from "../src/infrastructure/database/postgres";
const email = process.argv[2],
  url = process.env.MIGRATION_DATABASE_URL;
if (!url || !email || !email.includes("@"))
  throw new Error(
    "MIGRATION_DATABASE_URL et adresse vérifiée du compte existant requis.",
  );
const db = new PostgresDatabase(url);
try {
  const result = await db.query<{ id: string }>(
    "SELECT id FROM profiles WHERE lower(email)=lower($1) AND status='active'",
    [email],
  );
  if (result.rows.length !== 1)
    throw new Error("Un compte actif unique est requis.");
  await db.query(
    "INSERT INTO platform_admins VALUES($1) ON CONFLICT DO NOTHING",
    [result.rows[0].id],
  );
  console.log(
    "Administrateur de plateforme désigné. Aucun restaurant accessible sans affectation ou accord de support.",
  );
} finally {
  await db.close();
}
