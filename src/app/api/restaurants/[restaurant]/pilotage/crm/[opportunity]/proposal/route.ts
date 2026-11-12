import { crmProposalDetails } from "@/features/pilotage-addons/service";
import { proposalPdf } from "@/features/pilotage-addons/proposal-document";
import { failure } from "@/features/platform/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ restaurant: string; opportunity: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { restaurant, opportunity } = await context.params;
    const pdf = await proposalPdf(await crmProposalDetails(restaurant, opportunity));
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="proposition-${opportunity}.pdf"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) { return failure(error); }
}
