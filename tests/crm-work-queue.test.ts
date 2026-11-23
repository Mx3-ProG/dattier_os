import assert from "node:assert/strict";
import { test } from "node:test";
import { crmWorkQueue } from "../src/domain/crm/work-queue";

test("la liste de travail ignore les dossiers clos et les tâches terminées", () => {
  const queue = crmWorkQueue({
    inquiries: [{ id: "new", subject: "Question tarif", status: "new" }, { id: "done", subject: "Ancienne demande", status: "resolved" }],
    opportunities: [
      { id: "open", title: "Devis boutique", stage: "proposal", proposal_status: "sent", follow_up_at: "2026-11-11T09:00:00Z" },
      { id: "closed", title: "Vente gagnée", stage: "won", proposal_status: "accepted", follow_up_at: "2026-11-10T09:00:00Z" },
    ],
    activities: [
      { id: "due", opportunity_id: "open", title: "Appeler", due_at: "2026-11-12T08:00:00Z", done_at: null },
      { id: "today", opportunity_id: "open", title: "Rappeler", due_at: "2026-11-12T16:00:00Z", done_at: null },
      { id: "future", opportunity_id: "open", title: "À venir", due_at: "2026-11-13T09:00:00Z", done_at: null },
      { id: "done", opportunity_id: "open", title: "Déjà fait", due_at: "2026-11-10T09:00:00Z", done_at: "2026-11-10T10:00:00Z" },
      { id: "lost", opportunity_id: "closed", title: "Inutile", due_at: "2026-11-10T09:00:00Z", done_at: null },
    ],
  }, new Date("2026-11-12T12:00:00Z"));
  assert.deepEqual(queue.map((item) => item.key), ["inquiry:new", "proposal:open", "task:due", "task:today"]);
  assert.equal(queue[1].overdue, true);
  assert.equal(queue[3].overdue, false);
});
