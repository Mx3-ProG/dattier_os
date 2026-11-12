import { withRequestContext } from "@/features/ops-security/context";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, demoEnabled, one } from "@/infrastructure/database/db";
import { login } from "@/infrastructure/auth/session";
import { customerForActor } from "@/features/commerce/account";
import { seedDemoEngagement } from "@/features/commerce/engagement-demo";
import {
  assertOrigin,
  readBody,
  json,
  failure,
} from "@/features/platform/http";
async function routePOST(req: NextRequest) {
  try {
    if (!demoEnabled())
      return json({ error: "Démonstration désactivée." }, 404);
    await assertOrigin(req);
    const body = await readBody(req);
    if (typeof body.restaurant !== "string")
      throw new Error("Restaurant requis.");
    const db = await getDb();
    await one(db, "SELECT id FROM restaurants WHERE id=$1", [body.restaurant]);
    const id =
      "demo-customer:" +
      createHash("sha256").update(body.restaurant).digest("hex");
    await db.query(
      "INSERT INTO profiles(id,name,role,email) VALUES($1,'Camille · client fictif','WAITER','camille@example.test') ON CONFLICT(id) DO NOTHING",
      [id],
    );
    const identity = await login(id);
    // Fictive data so the gamified account is complete in the demo.
    await db.transaction(async (tx) =>
      seedDemoEngagement(
        tx,
        body.restaurant as string,
        await customerForActor(tx, body.restaurant as string, {
          ...identity,
          email: "camille@example.test",
        }),
      ),
    );
    return json({
      id: identity.id,
      name: identity.name,
      email: "camille@example.test",
    });
  } catch (e) {
    return failure(e);
  }
}

export const POST = withRequestContext("/api/demo/customer", routePOST);
