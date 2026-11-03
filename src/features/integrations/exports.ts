import { rows, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { log } from "@/features/orders/service";
const cell = (value: unknown) => {
  let s = String(value ?? "");
  if (typeof value === "string" && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export async function exportCsv(
  db: DB,
  r: string,
  user: Actor,
  kind: "sales" | "time_entries",
  from: string,
  to: string,
) {
  user = await scope(db, user, r);
  requirePermission(
    user.roles ?? user.role,
    kind === "sales" ? "finance" : "team",
  );
  const data =
    kind === "sales"
      ? await rows<Record<string, unknown>>(
          db,
          "SELECT p.id AS reference,p.created_at AS date,p.method AS mode,p.amount AS montant_centimes,p.discount AS remise_centimes FROM payment_declarations p LEFT JOIN orders o ON o.id=p.order_id LEFT JOIN table_sessions s ON s.id=p.session_id LEFT JOIN dining_tables t ON t.id=s.table_id WHERE coalesce(o.restaurant_id,t.restaurant_id)=$1 AND p.created_at>=$2::date AND p.created_at<$3::date+1 ORDER BY p.created_at,p.id LIMIT 10001",
          [r, from, to],
        )
      : await rows<Record<string, unknown>>(
          db,
          "SELECT t.id AS reference,t.profile_id AS collaborateur,p.name AS nom,t.event AS evenement,t.created_at AS date FROM time_entries t JOIN profiles p ON p.id=t.profile_id WHERE t.restaurant_id=$1 AND t.created_at>=$2::date AND t.created_at<$3::date+1 ORDER BY t.created_at,t.id LIMIT 10001",
          [r, from, to],
        );
  if (data.length > 10000)
    throw new Error("Réduisez la période pour exporter toutes les lignes.");
  await log(db, r, user.id, `Export ${kind}`, `${from}/${to}`);
  const header = data.length
    ? Object.keys(data[0])
    : kind === "sales"
      ? ["reference", "date", "mode", "montant_centimes", "remise_centimes"]
      : ["reference", "collaborateur", "nom", "evenement", "date"];
  return (
    "\ufeff" +
    [
      header.map(cell).join(";"),
      ...data.map((row) => header.map((h) => cell(row[h])).join(";")),
    ].join("\r\n")
  );
}
