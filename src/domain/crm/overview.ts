export type CrmOverview = {
  openInquiries: number;
  unassignedInquiries: number;
  openOpportunities: number;
  pipelineCents: number;
  wonCents: number;
  activeSupportCases: number;
  campaignRecipientsPending: number;
};

export function crmOverview(input: {
  inquiries: { status: string; assigned_to: string | null }[];
  opportunities: { stage: string; amount_cents: number }[];
  supportCases: { status: string }[];
  campaigns: { status: string; recipient_count: number; sent_count: number; skipped_count: number; error_count: number }[];
}): CrmOverview {
  const openInquiries = input.inquiries.filter((item) => item.status !== "resolved");
  return {
    openInquiries: openInquiries.length,
    unassignedInquiries: openInquiries.filter((item) => !item.assigned_to).length,
    openOpportunities: input.opportunities.filter((item) => !["won", "lost"].includes(item.stage)).length,
    pipelineCents: input.opportunities.filter((item) => !["won", "lost"].includes(item.stage)).reduce((sum, item) => sum + item.amount_cents, 0),
    wonCents: input.opportunities.filter((item) => item.stage === "won").reduce((sum, item) => sum + item.amount_cents, 0),
    activeSupportCases: input.supportCases.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    campaignRecipientsPending: input.campaigns.filter((item) => ["prepared", "sending"].includes(item.status)).reduce((sum, item) => sum + Math.max(0, item.recipient_count - item.sent_count - item.skipped_count - item.error_count), 0),
  };
}
