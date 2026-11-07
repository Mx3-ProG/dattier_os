import { z } from "zod";
import { PostgresDatabase } from "../src/lib/database/postgres";
import { referralPricing } from "../src/features/platform/referrals";

const [organization, rawPlan, rawSeats, ...archive] = process.argv.slice(2);
const input = z
  .object({
    organization: z.string().min(1),
    plan: z.union([z.literal(0), z.literal(39), z.literal(69), z.literal(99)]),
    seats: z.number().int().positive(),
  })
  .parse({ organization, plan: Number(rawPlan), seats: Number(rawSeats) });

const url = process.env.MIGRATION_DATABASE_URL;
if (!url)
  throw new Error("MIGRATION_DATABASE_URL requis pour gérer les forfaits.");
const db = new PostgresDatabase(url);
try {
  await db.query(
    "SELECT app.configure_organization_plan($1,$2,$3,$4::text[])",
    [input.organization, input.plan, input.seats, archive],
  );
  const { rows } = await db.query<{ paying: number }>(
    "SELECT app.paying_referrals($1) AS paying",
    [input.organization],
  );
  const paying = rows[0]?.paying ?? 0;
  const price = referralPricing(input.plan, input.seats, paying);
  console.log(
    `${input.organization} · ${input.seats} place(s) · ${price.total} € HT / mois · ${paying} filleul(s) payant(s)${price.free ? " · forfait offert par le parrainage" : ""}${price.freeSeats ? ` · ${price.freeSeats} établissement(s) offert(s)` : ""}`,
  );
} finally {
  await db.close();
}
