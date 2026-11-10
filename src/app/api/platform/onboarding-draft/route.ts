import { NextRequest } from "next/server";
import { withRequestContext } from "@/features/ops-security/context";
import { authenticated, assertOrigin, readBody, json, failure } from "@/features/platform/http";
import { saveOnboardingDraft } from "@/features/platform/service";

async function save(req: NextRequest) {
  try {
    await assertOrigin(req);
    const body = await readBody(req, 18000);
    return json(await authenticated(undefined,(db,user)=>saveOnboardingDraft(db,user,body)));
  } catch (error) { return failure(error); }
}
export const POST = withRequestContext("/api/platform/onboarding-draft",save);
