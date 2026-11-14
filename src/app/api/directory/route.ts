import { NextResponse } from "next/server";
import { getDb } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { publicDirectory } from "@/features/seo/directory";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await withDatabaseContext({ public: true }, () =>
    getDb().then((db) =>
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        return publicDirectory(tx);
      }),
    ),
  );
  return NextResponse.json(entries, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
