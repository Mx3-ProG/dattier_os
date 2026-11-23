import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";

export const runtime = "nodejs";
const schema = z.object({
  name: z.string().trim().min(1).max(180),
  email: z.email().max(320),
  subject: z.string().trim().min(1).max(180),
  message: z.string().trim().min(1).max(5000),
  website: z.string().max(200).optional(),
});
type Context = { params: Promise<{ restaurant: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    await assertOrigin(request);
    const { restaurant } = await context.params;
    const input = schema.parse(await readBody(request, 12000));
    if (input.website) return json({ ok: true });
    await withDatabaseContext({ restaurantId: restaurant, public: true }, async () =>
      (await getDb()).transaction(async (db) => {
        await db.exec("SET LOCAL ROLE atacuisine_app");
        await db.query("SELECT app.crm_public_inquiry($1,$2,$3,$4,$5)", [restaurant, input.name, input.email, input.subject, input.message]);
      }),
    );
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
