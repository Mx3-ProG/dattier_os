/* Cuisine IA, côté opérateur (connexion de migration).
   npm run ai:credits -- list                       demandes de packs en attente + marge du mois
   npm run ai:credits -- pay ID_DEMANDE             crédite un pack payé
   npm run ai:credits -- bonus ID_ORGANISATION 500  crédits offerts (geste commercial) */
import { z } from "zod";
import { PostgresDatabase } from "../src/lib/database/postgres";

const [command, first, second] = process.argv.slice(2);
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL requis pour gérer les crédits.");
const db = new PostgresDatabase(url);
try {
  if (command === "list") {
    const pending = await db.query(
      "SELECT p.id,o.name AS organisation,p.organization_id,p.pack,p.credits,p.price_cents/100.0 AS prix_ht,p.created_at FROM app.ai_pack_requests p JOIN organizations o ON o.id=p.organization_id WHERE p.status='pending' ORDER BY p.created_at",
    );
    console.table(pending.rows);
    const margin = await db.query(
      `SELECT count(*) FILTER (WHERE engine='reflex') AS reflexes,
              count(*) FILTER (WHERE engine<>'reflex') AS ia_avancee,
              -sum(delta) AS credits_consommes,
              round(sum(cost_micro_eur)/1e6,2) AS cout_fournisseur_eur
       FROM app.ai_ledger WHERE kind='usage' AND created_at>=date_trunc('month',now())`,
    );
    console.table(margin.rows);
  } else if (command === "pay") {
    const id = z.coerce.number().int().positive().parse(first);
    const { rows } = await db.query<{ organization_id: string; credits: number; pack: string }>(
      "SELECT organization_id,credits,pack FROM app.ai_pack_requests WHERE id=$1 AND status='pending'",
      [id],
    );
    if (!rows[0]) throw new Error("Demande introuvable ou déjà traitée.");
    const r = await db.query<{ balance: number }>(
      "SELECT app.ai_credit($1,$2,'purchase',$3,$4) AS balance",
      [rows[0].organization_id, rows[0].credits, `Pack ${rows[0].pack}`, id],
    );
    console.log(`${rows[0].organization_id} · +${rows[0].credits} crédits · solde ${r.rows[0].balance}`);
  } else if (command === "bonus") {
    const input = z
      .object({ organization: z.string().min(1), credits: z.number().int().positive().max(100000) })
      .parse({ organization: first, credits: Number(second) });
    const r = await db.query<{ balance: number }>(
      "SELECT app.ai_credit($1,$2,'bonus','Crédits offerts') AS balance",
      [input.organization, input.credits],
    );
    console.log(`${input.organization} · +${input.credits} crédits offerts · solde ${r.rows[0].balance}`);
  } else {
    console.log("Commandes : list | pay ID_DEMANDE | bonus ID_ORGANISATION CREDITS");
  }
} finally {
  await db.close();
}
