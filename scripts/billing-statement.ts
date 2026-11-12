import { PostgresDatabase } from "../src/infrastructure/database/postgres";
import { referralPricing, type PaidPlan } from "../src/features/platform/referrals";

/**
 * Monthly billing statement for the operator. Lists what to invoice for every
 * paying organisation after referral tiers, offered establishments and
 * "free month" credits. With --apply, consumes one credit (welcome first) for
 * each organisation that would otherwise be billed, at most once a month.
 */
const apply = process.argv.includes("--apply");
const url = process.env.MIGRATION_DATABASE_URL;
if (!url)
  throw new Error("MIGRATION_DATABASE_URL requis pour le relevé de facturation.");

type Row = {
  id: string;
  name: string;
  plan: PaidPlan;
  seats: number;
  paying: number;
  credits: number;
  used_this_month: boolean;
};

const db = new PostgresDatabase(url);
try {
  await db.transaction(async (tx) => {
    await tx.query("SELECT app.refresh_referrer(organization_id) FROM app.organization_plans");
    const { rows } = await tx.query<Row>(
      `SELECT o.id,o.name,p.plan,p.seats,app.paying_referrals(o.id) AS paying,
        (SELECT coalesce(sum(months),0)::int FROM app.referral_rewards w WHERE w.organization_id=o.id AND w.consumed_at IS NULL) AS credits,
        EXISTS(SELECT 1 FROM app.referral_rewards w WHERE w.organization_id=o.id AND w.consumed_at >= date_trunc('month',now())) AS used_this_month
       FROM organizations o JOIN app.organization_plans p ON p.organization_id=o.id
       WHERE p.plan > 0 AND o.status='active' ORDER BY o.name`,
    );
    let total = 0;
    for (const row of rows) {
      const price = referralPricing(row.plan, row.seats, row.paying);
      const covered = price.total > 0 && (row.used_this_month || row.credits > 0);
      const due = covered ? 0 : price.total;
      total += due;
      const notes = [
        `${row.paying} filleul(s) payant(s)`,
        price.free && "forfait offert",
        price.freeSeats && `${price.freeSeats} établissement(s) offert(s)`,
        row.credits && `${row.credits} mois offert(s) en réserve`,
        covered && (row.used_this_month ? "mois offert déjà utilisé ce mois-ci" : "mois offert utilisé"),
      ].filter(Boolean);
      console.log(
        `${row.name} (${row.id}) · forfait ${row.plan} € · ${row.seats} place(s) · brut ${price.gross} € · après parrainage ${price.total} € · À FACTURER ${due} € TTC\n    ${notes.join(" · ")}`,
      );
      if (apply && covered && !row.used_this_month)
        await tx.query(
          `UPDATE app.referral_rewards SET consumed_at=now() WHERE id=(
            SELECT id FROM app.referral_rewards WHERE organization_id=$1 AND consumed_at IS NULL
            ORDER BY kind='welcome' DESC, granted_at LIMIT 1)`,
          [row.id],
        );
    }
    console.log(`\nTotal à facturer : ${total} € TTC${apply ? " · crédits consommés" : " · relancer avec --apply pour consommer les mois offerts"}`);
  });
} finally {
  await db.close();
}
