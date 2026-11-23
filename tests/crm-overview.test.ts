import assert from "node:assert/strict";
import { test } from "node:test";
import { crmOverview } from "../src/domain/crm/overview";

test("la vue CRM exclut les dossiers clos et ne confond pas pipeline et ventes", () => {
  const result = crmOverview({
    inquiries: [{ status: "new", assigned_to: null }, { status: "in_progress", assigned_to: "member" }, { status: "resolved", assigned_to: null }],
    opportunities: [{ stage: "lead", amount_cents: 10000 }, { stage: "won", amount_cents: 20000 }, { stage: "lost", amount_cents: 30000 }],
    supportCases: [{ status: "open" }, { status: "closed" }],
    campaigns: [{ status: "prepared", recipient_count: 10, sent_count: 3, skipped_count: 2, error_count: 1 }, { status: "completed", recipient_count: 5, sent_count: 4, skipped_count: 0, error_count: 1 }],
  });
  assert.deepEqual(result, { openInquiries: 2, unassignedInquiries: 1, openOpportunities: 1, pipelineCents: 10000, wonCents: 20000, activeSupportCases: 1, campaignRecipientsPending: 4 });
});
