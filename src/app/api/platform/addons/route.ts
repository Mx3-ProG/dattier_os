import { NextRequest } from "next/server";
import { addonAdminPerform, addonAdminState } from "@/features/addons/store-admin";
import { assertOrigin, failure, json, readBody } from "@/features/platform/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    return json(await addonAdminState());
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    await assertOrigin(req);
    return json(await addonAdminPerform(await readBody(req)));
  } catch (error) {
    return failure(error);
  }
}
