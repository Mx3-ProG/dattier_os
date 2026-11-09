/* Contrôle anti-fraude humain des paiements signalés. Réservé à l’opérateur :
   un restaurateur ne peut pas lever lui-même le contrôle sur ses propres ventes. */
import { PostgresDatabase } from "../src/lib/database/postgres";
import { rows } from "../src/lib/database/db";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL requis.");
const [command, id] = process.argv.slice(2);
const db = new PostgresDatabase(url);
try {
  if (command === "list")
    console.table(
      await rows(
        db,
        "SELECT id,restaurant_id,gross,risk_level,paid_at FROM online_payments WHERE status='paid' AND risk_status='review' ORDER BY paid_at",
      ),
    );
  else if (command === "approve" && id) {
    const done = await db.query(
      "UPDATE online_payments SET risk_status='clear' WHERE id=$1 AND status='paid' AND risk_status='review'",
      [id],
    );
    console.log(
      done.affectedRows ? "Paiement validé." : "Aucun paiement à valider.",
    );
  } else
    console.log(
      "Usage : npm run payments:review -- list | approve ID_PAIEMENT",
    );
} finally {
  await db.close();
}
